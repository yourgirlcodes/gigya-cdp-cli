import {CDP} from "../gigya-cdp-sdk";
import {BusinessUnitId, CustomerSchema, SchemaType} from "../gigya-cdp-sdk/entities";
import {DirectEventName, DirectEvents} from "./Events/Direct";
import {JSONSchema7} from "json-schema";
import {profileSchema as boilerplateProfileSchema} from "./schemas/ProfileSchema";
import {activitySchemas as boilerplateActivitySchemas} from "./schemas/ActivitiesSchemas";
import {purchaseSum as boilerplateActivityIndicator} from "./ActivityIndicators/PurchaseSum";
import {VIPSegment} from "./Segments/VIPSegment";
import {config} from "./BoilerplateConfig";
import {CampaignAudience} from "./Audiences/AudienceCondition";

/*
       1. always extend, never delete
       2. log operations
       3. only update if there a change is required, e.g. if the current schema already contains the boilerplate schema then no need to update.
       4. override users config if it does not make sense to keep it.
 */

export function createBoilerplate(sdk: CDP) {
    return {
        for(bUnitId: BusinessUnitId) {
            const bOps = sdk.api.businessunits.for(bUnitId);

            return {
                schemas: {
                    async alignProfile() { //TODO: age vs birthdate??
                        console.log("~~~~~~~~ aligning profile schema ~~~~~~~~");
                        console.log('~~~~~~~~ boilerplate profile schema:', boilerplateProfileSchema);

                        const profileSchemaEntity = await bOps.ucpschemas.getAll().then(schemas => schemas.find(s => s.schemaType == SchemaType.Profile));

                        let alignProfilePromise: Promise<CustomerSchema>;

                        if (!profileSchemaEntity) {
                            alignProfilePromise = bOps.ucpschemas.create({
                                enabled: true,
                                name: "Profile",
                                schema: JSON.stringify(boilerplateProfileSchema),
                                schemaType: SchemaType.Profile
                            });
                        } else {
                            const profileSchema = JSON.parse(profileSchemaEntity.schema.toString());
                            const profileFields = Object.keys(profileSchema.properties);
                            const boilerplateProfileFields = Object.keys(boilerplateProfileSchema.properties);
                            const fieldDiffs = boilerplateProfileFields.filter(f => !profileFields.includes(f));

                            alignProfilePromise = !fieldDiffs.length ?
                                Promise.resolve(profileSchemaEntity)
                                : bOps.ucpschemas.for(profileSchemaEntity.id).update({
                                enabled: true,
                                name: "Profile",
                                schema: JSON.stringify({
                                    ...profileSchema,
                                    properties: {...boilerplateProfileSchema, ...profileSchema.properties}
                                }),
                                schemaType: SchemaType.Profile
                            });
                        }

                        const alignedProfile = await alignProfilePromise;
                        console.log('~~~~~ aligned profile:', alignedProfile);
                    },
                    async alignActivities() {
                        let alignActivityPromise: Promise<CustomerSchema>
                        const boilerplateActivities = Object.keys(boilerplateActivitySchemas);

                        for (const activity of boilerplateActivities) {
                            console.log(`~~~~~~ aligning ${activity} Activity`);
                            const activitySchema = await bOps.ucpschemas.getAll().then(schemas => schemas.find(s => s.name == activity));

                            if (!activitySchema) {
                                alignActivityPromise = bOps.ucpschemas.create({
                                    enabled: true,
                                    name: activity,
                                    schema: JSON.stringify(boilerplateActivitySchemas[activity]),
                                    schemaType: SchemaType.Activity
                                });
                            } else {
                                const parsedUserActivity = JSON.parse(activitySchema.schema.toString());
                                const userOrdersProperties = Object.keys(parsedUserActivity.properties);
                                const fieldDiffs = Object.keys(boilerplateActivitySchemas[activity].properties).filter(f => !userOrdersProperties.includes(f));

                                alignActivityPromise = !fieldDiffs.length ?
                                    Promise.resolve(alignActivityPromise)
                                    : bOps.ucpschemas.for(activitySchema.id).update({
                                        enabled: activitySchema.enabled,
                                        name: activity,
                                        schema: JSON.stringify({
                                            ...parsedUserActivity,
                                            properties: {...boilerplateActivitySchemas[activity].properties, ...parsedUserActivity.properties}
                                        }),
                                        schemaType: SchemaType.Activity
                                    });
                                }
                            const alignedActivity = await alignActivityPromise
                            console.log(`~~~~~~~~aligned ${activity}`, alignedActivity)
                        }
                    }
                },
                activityIndicators: {
                    async align() {
                        console.log('~~~~~~~ aligning Activity Indicators')

                        let alignedActivityIndicator;
                        const userOrdersActivitySchema = await bOps.ucpschemas.getAll().then(schemas => schemas.find(s => s.name == 'Orders'))
                        const userActivityIndicators = await bOps.activityIndicators.getAll().then(a => a.find(ind => (['Purchase Sum', 'purchaseSum'].includes(ind.name)))) // TODO: CHANGE TO == since we dont need purchaseSum

                        if (userActivityIndicators) {
                            const fieldDiffs = Object.entries(boilerplateActivityIndicator).find(f => !Object.entries(userActivityIndicators).includes(f))

                            if (fieldDiffs.length) {
                                alignedActivityIndicator = bOps.activityIndicators.for(userActivityIndicators.id).update({
                                    ...boilerplateActivityIndicator,
                                    schemaId: userOrdersActivitySchema.id, // nope -- this assumes a schema??
                                }).then(res => res)
                            } else return // to get to next else?

                        } else alignedActivityIndicator = bOps.activityIndicators.create({
                            ...boilerplateActivityIndicator,
                            schemaId: userOrdersActivitySchema.id,
                        })
                        console.log('~~~~~ Activity Indicator aligned!', alignedActivityIndicator)
                    }
                },
                segments: {
                    async align() {
                        let alignedSegment;
                        console.log('~~~~~~~ aligning segment')
                        const userVIPSegment = await bOps.segments.getAll().then(segments => segments.find(s => s.name == 'VIP'))
                        if (userVIPSegment) {
                            alignedSegment = bOps.segments.for(userVIPSegment.id).update({
                                ...VIPSegment
                            })
                        } else {
                            alignedSegment = bOps.segments.create({
                                ...VIPSegment
                            })

                        }
                        console.log('~~~~~~ segment is aligned!', alignedSegment)
                    }
                },
                purposes: {
                    async align() {
                        console.log('~~~~~~  aligning Purposes')
                        const userPurposes = await bOps.purposes.getAll().then(p => p)
                        console.log('userPurposes', userPurposes)
                        // TODO: zoe come back here
                        // basic - attributes: profile.firstName, profile.lastName, profile.primaryEmail
                        // marketing - attributes: segment.VIP, activityIndicator.purchaseSum
                    }
                },
                applications: { //TODO: mapping for events
                    async alignDirect() {
                        let boilerplateDirectApplication;
                        let boilerPlateEvents;
                        console.log("~~~~~~~ aligning Direct applications")
                        const userDirectApplication = await bOps.applications.getAll().then(apps => apps && apps.find(app => app['type'] == 'Basic' && app.name == 'Test Application'))

                        if (userDirectApplication) {
                            const userDirectEvents = await bOps.applications.for(userDirectApplication.id).dataevents.getAll().then(events => events && events.filter(e => ['purchase', 'page-view'].includes(e.name)))
                            if (userDirectEvents.length) {
                                for (let event of userDirectEvents) {
                                    boilerPlateEvents = await bOps.applications.for(userDirectApplication.id).dataevents.for(event.id).update({
                                        ...DirectEvents[event.name]
                                    })
                                }
                            } else {
                                for (let event of config.directEvents) {
                                    boilerPlateEvents = await bOps.applications.for(userDirectApplication.id).dataevents.create({
                                        ...DirectEvents[event]
                                    })
                                }
                            }
                            // going to have repeat of creating events
                        } else {
                            boilerplateDirectApplication = await bOps.applications.create({
                                enabled: true,
                                logoUrl: "https://universe.eu5-st1.gigya.com/assets/img/connect-application.png",
                                name: "Test Application",
                                securitySchemes: {}, // TODO: confirm this
                                description: "R&D test application for creating customers"
                            }).then(res => console.log('~~~~~ aligned Direct application:', res))

                            for (let event of config.directEvents) {
                                boilerPlateEvents = await bOps.applications.for(userDirectApplication.id).dataevents.create({
                                    ...DirectEvents[event]
                                })
                            }
                        }
                        /*
                            create direct application:
                              `  name: Test Application
                                desc: R&D test application for creating customers
                                enabled: true
                                create direct events according to boilerplate
                                    settings
                                    schema
                                    mapping TODO:
                                        to profile
                                            TO THE SAME IDENTIFIER
                                        to activities`
                         */
                    },
                    async alignCloudStorage() {
                        // TODO: zoe
                        /*
                            get all connectors from the applibrary
                            for each cloud storage connector
                            create an application -
                                name according to connector's
                                enabled: false
                                mock all other fields
                                mock auth & config
                                create an event
                                    name: `new customers from ${app.name}`
                                    purposes: basic
                                    mock settings & config
                                    create schema according to boilerplate
                                    create mapping
                                    no schedule
                         */
                    },
                    alignAll() {
                        return Promise.all([
                            this.alignDirect(),
                            this.alignCloudStorage()
                        ]);
                    }
                },
                audiences: {
                    async align() {
                        console.log('~~~~~~~ aligning Audiences')
                        let boilerAudience;
                        const view = await bOps.views.getAll().then(views => views.find(v => v.type == "Marketing"));
                        const vOps = bOps.views.for(view.id);

                        const userAudience = await vOps.audiences.getAll().then(audiences => audiences.find(a => a.name == "My Campaign Audience"))

                        if (userAudience) {
                            console.log(userAudience)
                            boilerAudience = await vOps.audiences.for(userAudience.id).update({...CampaignAudience as any}) //TODO: dont do this.
                        } else {
                            boilerAudience = await vOps.audiences.create({...CampaignAudience as any, viewId: view.id}) //TODO: dont do this.
                        }

                        console.log('~~~~~ Audience aligned!', boilerAudience)
                    }
                },
                async alignAll() {
                    await Promise.all([
                        this.schemas.alignProfile(),
                        this.schemas.alignActivities()
                    ]);

                    await this.activityIndicators.align();
                    await this.segments.align();
                    await this.purposes.align();

                    await Promise.all([
                        this.applications.alignAll(),
                        this.audiences.align()
                    ]);
                },
                async ingestFakeEvents(customersNum: number, events: DirectEventName[]) {
                    // TODO: zoe
                    /*
                        according to customersNum
                            create a unique common identifier
                            for each event in events
                                create a fake event using its schema and common identifier and send to ingest
                     */
                }
            }
        }
    };
}


