import {CDP} from "../gigya-cdp-sdk";
import {
    ActivityIndicator,
    Application,
    BusinessUnitId,
    CustomerSchema,
    Event, ProfileFieldName, PurposeId,
    SchemaType,
    Segment,
    Purpose
} from "../gigya-cdp-sdk/entities";
import {boilerplateDirectEvents} from "./Events/Direct";
import {profileSchema as boilerplateProfileSchema} from "./schemas/ProfileSchema";
import {ActivityName, activitySchemas as boilerplateActivitySchemas} from "./schemas/ActivitiesSchemas";
import {purchaseSum as boilerplateActivityIndicator} from "./ActivityIndicators/PurchaseSum";
import {VIPSegment} from "./Segments/VIPSegment";
import {config, DirectEventName} from "./BoilerplateConfig";
import {CampaignAudience as boilerplateAudience} from "./Audiences/AudienceCondition";
import {Audience} from "../gigya-cdp-sdk/entities/Audience";
import {defaultDirectApplication as boilerplateDirectApplication} from "./Applications/defaultDirectApplication";
import {Payload} from "../gigya-cdp-sdk/entities/common";
import {Purposes as boilerplatePurposes} from "./purposes/purposes";
import {matchingRule} from "./MatchRules/matchRules";
import {cloudStorageApplications as boilerplateCloudStorageApplications} from "./Applications/defaultCloudStorageApplications";
import {boilerplateCloudStorageEvent} from "./Events/CloudStorage";
import {terminal} from "terminal-kit";
import {JSONSchema7} from "json-schema";
import {EventMapping} from "../gigya-cdp-sdk/entities/Event/EventMapping";
import {EventMappingsResponse} from "../gigya-cdp-sdk/CDPEntitiesApi";

const isEqual = require('lodash/isEqual');
const _ = require('lodash')

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
            terminal.bgMagenta.black('~~~~~~~~~ Aligning your Business Unit ~~~~~~~~~~');
            terminal('\n');

            return {
                schemas: {
                    async alignProfile() {
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
                            const profileSchema = JSON.parse(JSON.stringify(profileSchemaEntity.schema));
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
                                        properties: {...boilerplateProfileSchema.properties, ...profileSchema.properties}
                                    }),
                                    schemaType: SchemaType.Profile
                                });
                        }

                        const alignedProfile = await alignProfilePromise;
                        terminal.blue('~~~~~ aligned Profile Schema:', alignedProfile);
                        terminal('\n');

                    },


                    async alignActivities() {

                        let alignActivityPromise: Promise<CustomerSchema>;
                        const customerSchemas = await bOps.ucpschemas.getAll();

                        for (const [activity, boilerplateSchema] of Object.entries(boilerplateActivitySchemas)) {
                            const activitySchema = customerSchemas.find(s => s.name == activity && s.schemaType == SchemaType.Activity);
                            if (!activitySchema) {
                                alignActivityPromise = bOps.ucpschemas.create({
                                    enabled: true,
                                    name: activity,
                                    schema: JSON.stringify(boilerplateProfileSchema),
                                    schemaType: SchemaType.Activity
                                });
                            } else {
                                const remoteActivitySchema = JSON.parse(JSON.stringify(activitySchema.schema));
                                const remoteSchemaProperties = Object.keys(remoteActivitySchema.properties);
                                const fieldDiffs = Object.keys(boilerplateSchema.properties).filter(f => !remoteSchemaProperties.includes(f));


                                alignActivityPromise = !fieldDiffs.length ?
                                    Promise.resolve(activitySchema)
                                    : bOps.ucpschemas.for(activitySchema.id).update({
                                        enabled: true,
                                        name: activity,
                                        schema: JSON.stringify({
                                            ...remoteActivitySchema,
                                            properties: {...remoteActivitySchema.properties, ...boilerplateSchema.properties} //order = priority => lower, higher
                                        }),
                                        schemaType: SchemaType.Activity
                                    });
                            }
                            const alignedActivity = await alignActivityPromise;
                            terminal.colorRgb(0, 135, 255)(`~~~~~~~~ aligned ${activity} Activity Schema`, alignedActivity);
                            terminal('\n');

                        }
                    }
                },

                matchRules: {
                    async alignMatchRules() {

                        const view = await bOps.views.getAll().then(views => views.find(v => v.type == "Marketing"));
                        const vOps = bOps.views.for(view.id);
                        const remoteMatchRules = await vOps.matchRules.getAll();

                        const masterDataIdMR = remoteMatchRules?.find(matchRules => matchRules.attributeName == config.commonIdentifier);

                        !masterDataIdMR ? await vOps.matchRules.create({
                            attributeName: config.commonIdentifier,
                            name: config.commonIdentifier,
                            ucpResolutionPolicy: 'merge',
                            // if they are not equal, update
                            // if they are equal, don't do anything
                        }) : (!isEqual(masterDataIdMR, matchingRule) ?? (await vOps.matchRules.for(masterDataIdMR.id).update({
                            attributeName: config.commonIdentifier, // this seems too explicit if I have already created an interface, but ...masterDataIdMR does not work
                            name: config.commonIdentifier,
                            ucpResolutionPolicy: 'merge',
                        })));
                    },
                },

                activityIndicators: {
                    async align() {

                        let alignedActivityIndicatorPromise: Promise<ActivityIndicator>

                        const [remoteActivitySchema, remoteActivityIndicator] = await Promise.all([
                            bOps.ucpschemas.getAll().then(schemas => schemas.find(s => s.name == ('Orders' as ActivityName))),
                            bOps.activityIndicators.getAll().then(a => a.find(ind => (config.activityIndicators.includes(ind.name))))
                        ]);

                        if (!remoteActivityIndicator) {
                            alignedActivityIndicatorPromise = bOps.activityIndicators.create({
                                ...boilerplateActivityIndicator,
                                schemaId: remoteActivitySchema.id,
                            });
                        } else {
                            const fieldDiffs = Object.entries(boilerplateActivityIndicator).find(f => !Object.entries(remoteActivityIndicator).includes(f));

                            alignedActivityIndicatorPromise = !fieldDiffs.length ?
                                Promise.resolve(remoteActivityIndicator)
                                : bOps.activityIndicators.for(remoteActivityIndicator.id).update({
                                    ...boilerplateActivityIndicator,
                                    schemaId: remoteActivitySchema.id,
                                });
                        }
                        const alignedActivityIndicator = await alignedActivityIndicatorPromise;
                        terminal.colorRgb(0, 255, 255)('~~~~~~~ aligned Activity Indicator:', alignedActivityIndicator);
                        terminal('\n');

                    },
                },

                segments: {
                    async align() {

                        let alignedSegmentPromise: Promise<Segment>;

                        const remoteSegment = await bOps.segments.getAll().then(segments => segments.find(s => s.name == VIPSegment.name));
                        //get the VIP remote segment and see if its values are the same
                        // values are the conditions with their associated value
                        if (remoteSegment) {

                            // if all 3 are not the same, update the segment to be the boilerplateVIPSegment
                            if ((remoteSegment.values.length === VIPSegment.values.length) &&
                                VIPSegment.values.every(segmentValue =>
                                    remoteSegment.values.some(remoteValue => isEqual(segmentValue, remoteValue)))) {
                                alignedSegmentPromise = Promise.resolve(remoteSegment)
                            } else {
                                alignedSegmentPromise = bOps.segments.for(remoteSegment.id).update({
                                    ...VIPSegment
                                })
                            }
                        } else {
                            alignedSegmentPromise = bOps.segments.create({
                                ...VIPSegment
                            });
                        }
                        const alignedSegment = await alignedSegmentPromise

                        terminal.colorRgb(135, 215, 255)('~~~~~~ aligned Segment');
                        terminal('\n');
                        console.log(alignedSegment)
                    }
                },

                purposes: {
                    async align() {
                        const remotePurposes = bOps.purposes.getAll()

                        let finalPurpose: Payload<Purpose>

                        Object.entries(boilerplatePurposes).map(async ([boilerplatePurposeName, boilerplatePurposePayload]) => {

                            const purposeId = (await remotePurposes.then(purposes => purposes.find(p => p.name == boilerplatePurposeName)))?.id

                            const cleanedRemotePurposes = await remotePurposes.then(purposes => purposes.map(purpose => {
                                delete purpose.id
                                delete purpose.created;
                                delete purpose.updated;
                                return purpose
                            }))

                            const purpose = cleanedRemotePurposes.find(p => p.name == boilerplatePurposeName)


                            if (!purpose || !purposeId) {
                                finalPurpose = await bOps.purposes.create({
                                    ...boilerplatePurposePayload
                                })
                            }

                            // if remote purpose is not the same as boilerplate, update the remote
                            if (!isEqual(purpose, boilerplatePurposePayload)) {
                                // @ts-ignore
                                finalPurpose = await bOps.purposes.update({
                                    id: purposeId,
                                    ...boilerplatePurposePayload
                                })
                            }
                            terminal.colorRgb(95, 95, 255)('~~~~~~~~ aligned Purpose', finalPurpose)
                        })
                    }
                },

                applications: {
                    async alignDirect() {

                        console.log("~~~~~~~ aligning Direct applications");
                        let remoteApplications = await bOps.applications.getAll();

                        let remoteApplication = (remoteApplications?.find(app =>
                            app.type === boilerplateDirectApplication.type && app.name === boilerplateDirectApplication.name))

                        // no existing remoteApp --> create one
                        if (!remoteApplication) {
                            remoteApplication = (await bOps.applications.create({
                                type: 'Basic',
                                enabled: true,
                                logoUrl: "https://universe.eu5-st1.gigya.com/assets/img/connect-application.png",
                                name: "Direct Test Application",
                                securitySchemes: {},
                                description: "R&D test application for creating customers"
                            }))
                        }

                        const remoteApplicationId = remoteApplication?.id

                        const appOps = bOps.applications.for(remoteApplicationId)

                        const [remoteSchemas, remoteDirectEvents, bUnitPurposes] = await Promise.all([
                            bOps.ucpschemas.getAll(),
                            appOps.dataevents.getAll(),
                            bOps.purposes.getAll()
                        ])

                        function normalizeMappings(mappings, targetSchemaId?) {
                            let adjustedMappings = []
                            mappings?.map(mapping => {
                                adjustedMappings.push({
                                    sourceField: mapping.sourceField ? mapping.sourceField : mapping.srcField,
                                    targetField: mapping.targetField,
                                    target: targetSchemaId || mapping.target
                                })
                            })
                            return adjustedMappings
                        }


                        async function checkToUpdateOrCreateMappings(remoteDirectEventId, boilerplateMapping) {
                            // get the mappings for the remote direct event
                            let remoteMappings = await appOps.dataevents.for(remoteDirectEventId).mappings.get() as EventMapping[]
                            let mappingsArray = []
                            let alignedMappings: EventMappingsResponse

                            Object
                                .entries(boilerplateMapping)
                                .map(async ([schemaName, mappings]) => {
                                    // find the id of the remote schema who has the same name as our schema.. eg 'Profile' / 'Orders' / 'Page-Views'
                                    const targetSchemaId = (remoteSchemas.find(remoteSchema => remoteSchema.name == schemaName)).id

                                    if (!targetSchemaId)
                                        new Error(`mapping set to a non existing schema: ${schemaName}`);

                                    const adjustedBoilerplateMappings = normalizeMappings(mappings, targetSchemaId)
                                    mappingsArray.push(adjustedBoilerplateMappings)
                                    mappingsArray.flat()
                                })

                            // check if remote mappings and boilerplate mappings are equal
                            const isArrayEqual = function (bpMappings, rMappings) {
                                return _(bpMappings).differenceWith(rMappings, _.isEqual).isEmpty();
                            };


                            if (remoteMappings.length < 1) {
                                alignedMappings = await appOps.dataevents.for(remoteDirectEventId).mappings.create({
                                    mappings: mappingsArray.flat()
                                }) as EventMappingsResponse
                            } else {
                                const adjustedRemoteMappings = normalizeMappings(remoteMappings)
                                if (!isArrayEqual(mappingsArray, adjustedRemoteMappings)) {
                                    alignedMappings = await appOps.dataevents.for(remoteDirectEventId).mappings.create({
                                        mappings: mappingsArray.flat()
                                    }) as EventMappingsResponse
                                }
                            }
                            terminal.colorRgb(175,0,135)(`aligned Direct Event Mappings`);
                            terminal('/n')
                            console.log(alignedMappings.mappings);
                        }

                        function adjustBoilerplateEventForPurposeIds(boilerplateEvent) {
                            // change purposeNames to purposeIds in boilerplateEvent
                            const eventPurposeIds = boilerplateEvent.purposeIds.map(purposeName => bUnitPurposes.find(p => p.name == purposeName).id).filter(Boolean);
                            return {
                                ...boilerplateEvent,
                                purposeIds: eventPurposeIds
                            };
                        }

                        async function adjustRemoteEventForComparisonWithAdjustedBpEvent(boilerplateEvent, remoteEvent) {

                            let remoteEventToCompare = {}
                            Object.keys(boilerplateEvent).forEach(k => {
                                remoteEventToCompare[k] = remoteEvent[k]
                            })

                            return remoteEventToCompare
                        }

                        async function createRemoteDirectEvent(boilerplateEvent) {
                            const adjustedBoilerplateEvent = adjustBoilerplateEventForPurposeIds(boilerplateEvent);
                            return  appOps.dataevents.create({
                                ...adjustedBoilerplateEvent,
                                schema: JSON.stringify(boilerplateEvent.schema),
                                purposeIds: JSON.stringify(adjustedBoilerplateEvent.purposeIds) as any
                            });
                        }

                        function updateRemoteDirectEvent(boilerplateEvent, remoteEvent) {
                            return appOps.dataevents.for(remoteEvent.id).update({
                                ...boilerplateEvent,
                                schema: JSON.stringify(boilerplateEvent.schema),
                                purposeIds: JSON.stringify(boilerplateEvent.purposeIds)
                            }).then(res => console.log(res))
                        }

                        terminal.colorRgb(175,0,135)(`aligned Direct Application`);
                        terminal('/n')
                        console.log(remoteApplication);

                        await Promise.all(
                        Object.entries(boilerplateDirectEvents).map(async ([eventName, {payload: boilerplateEvent, mapping: boilerplateMapping}]) => {

                                let remoteDirectEventId = remoteDirectEvents?.find(ev => ev.name == eventName)?.id;
                                // if no remote event, create them
                                // if there is a remoteEvent, check it and update/keep
                                if (!remoteDirectEventId) {
                                    const remoteDirectEvent = await createRemoteDirectEvent(boilerplateEvent);
                                    remoteDirectEventId = remoteDirectEvent.id;
                                    terminal.colorRgb(175,0,135)(`aligned ${eventName} Direct Event`);
                                    terminal('/n')
                                    terminal.colorRgb(175,0,135)(remoteDirectEvent);
                                }

                                const remoteEvent = await appOps.dataevents.for(remoteDirectEventId).get();


                                const adjustedBPEventForPurposeIds = adjustBoilerplateEventForPurposeIds(boilerplateEvent);
                                const adjustedRemoteEventForComparisonWithAdjustedBpEvent = await adjustRemoteEventForComparisonWithAdjustedBpEvent(boilerplateEvent, remoteEvent);
                                if (!isEqual(adjustedRemoteEventForComparisonWithAdjustedBpEvent, adjustedBPEventForPurposeIds)) {
                                    const alignedDirectEvent = await updateRemoteDirectEvent(adjustedBPEventForPurposeIds, remoteEvent);
                                    terminal.colorRgb(175,0,135)(`aligned ${eventName} Direct Event`);
                                    terminal('/n')
                                    console.log(alignedDirectEvent);
                                }

                                await checkToUpdateOrCreateMappings(remoteDirectEventId, boilerplateMapping);
                            }));

                        console.log('~~~~~~~ Direct Application is aligned!');
                        console.log('~~~~~~~ Direct Events are aligned!');
                        console.log('~~~~~~~ Mappings are aligned!');
                    },

                    async alignCloudStorage() {
                        const [remoteSchemas, bUnitPurposes] = await Promise.all([
                            bOps.ucpschemas.getAll(),
                            bOps.purposes.getAll()
                        ])

                        const eventPurposeIds = boilerplateCloudStorageEvent.payload.purposeIds.map(purposeName => bUnitPurposes.find(p => p.name == purposeName).id).filter(Boolean);

                        function getAppViewModel(application) {
                            return {
                                configValues: application.configValues ? application.configValues : boilerplateCloudStorageApplications[application.resources.type].configValues,
                                type: application.type || application.resources.type,
                                name: application.name,
                                description: application.description
                            }
                        }

                        function adjustBoilerplateEventForPurposeIdsAndName(remoteEvent) {
                            // change purposeNames to purposeIds in boilerplateEvent
                            return {
                                payload: {
                                    ...boilerplateCloudStorageEvent.payload,
                                    name: `${boilerplateCloudStorageEvent.payload.name} ${remoteEvent.name}`,
                                    purposeIds: eventPurposeIds
                                }
                            }
                        }

                        function normalizeMappings(mappings, targetSchemaId?) {
                            return mappings?.map(mapping => {
                                return {
                                    sourceField: mapping.sourceField ? mapping.sourceField : mapping.srcField,
                                    targetField: mapping.targetField,
                                    target: targetSchemaId || mapping.target
                                }
                            })
                        }

                        function createCloudStorageEvent(boilerplateEvent, remoteCloudStorageApplication) {
                            return bOps.applications.for(remoteCloudStorageApplication.id).dataevents.create({
                                ...boilerplateEvent,
                                schema: JSON.stringify(boilerplateEvent.schema),
                                purposeIds: JSON.stringify(boilerplateEvent.purposeIds) as any
                            })
                        }

                        function adjustRemoteEventForComparisonWithAdjustedBpEvent(boilerplateEvent, remoteEvent) {

                            let remoteEventToCompare = {}
                            Object.keys(boilerplateEvent).forEach(k => {
                                remoteEventToCompare[k] = remoteEvent[k]
                            })

                            return remoteEventToCompare
                        }

                        function updateRemoteCloudStorageEvent(adjustedBoilerplateEvent, remoteCloudStorageApplicationId, remoteCloudStorageEventIdForApplication) {
                            return bOps.applications.for(remoteCloudStorageApplicationId).dataevents.for(remoteCloudStorageEventIdForApplication).update({
                                ...adjustedBoilerplateEvent,
                                schema: JSON.stringify(adjustedBoilerplateEvent.schema),
                                purposeIds: JSON.stringify(adjustedBoilerplateEvent.purposeIds) as any
                            })
                        }

                        async function checkToUpdateOrCreateMappings(remoteCloudStorageEventIdForApplication, boilerplateCloudStorageEventMapping, remoteCloudStorageApplicationId) {
                            // get the mappings for the remote direct event
                            let remoteMappings = await bOps.applications.for(remoteCloudStorageApplicationId).dataevents.for(remoteCloudStorageEventIdForApplication).mappings.get() as EventMapping[];

                            // find the id of the remote schema who has the same name as our schema.. eg 'Profile'
                            const targetSchemaId = (remoteSchemas.find(remoteSchema => remoteSchema.name == 'Profile')).id

                            if (!targetSchemaId)
                                new Error(`mapping set to a non existing schema: Profile`);

                            const adjustedBoilerplateMappings = normalizeMappings(boilerplateCloudStorageEventMapping['Profile'], targetSchemaId)

                            // check if remote mappings and boilerplate mappings are equal
                            // using Lodash's
                            // - differenceWith, which checks the differences between values in two arrays - returns array of the difference
                            // - isEmpty which checks for empty array - returns boolean
                            // - isEqual which checks equality of two arrays - returns boolean
                            const isArrayEqual = function (bpMappings, rMappings) {
                                return _(bpMappings).differenceWith(rMappings, _.isEqual).isEmpty();
                            };

                            if (remoteMappings.length < 1) {
                                return bOps.applications.for(remoteCloudStorageApplicationId).dataevents.for(remoteCloudStorageEventIdForApplication).mappings.create({
                                    mappings: adjustedBoilerplateMappings
                                })
                            } else {
                                const adjustedRemoteMappings = normalizeMappings(remoteMappings)
                                if (!isArrayEqual(adjustedBoilerplateMappings, adjustedRemoteMappings)) {
                                    await bOps.applications.for(remoteCloudStorageApplicationId).dataevents.for(remoteCloudStorageEventIdForApplication).mappings.create({
                                        mappings: adjustedBoilerplateMappings
                                    })
                                }
                            }
                        }


                        const remoteApplications = (await bOps.applications.getAll());
                        const remoteConnectors = await sdk.api.workspaces.for(config.workspaceId).applibrary.getAll({includePublic: true});

                        // get remote connectors that are Cloud Storage connectors
                        const remoteCloudStorageConnectors = remoteConnectors['connectors'] && remoteConnectors['connectors'].filter(connector => connector.type === 'CloudStorage')

                        remoteCloudStorageConnectors.map(async connector => {
                            // get the corresponding cloud storage application
                            let remoteCloudStorageApplication = remoteApplications?.find(application => application['originConnectorId'] == connector.id);

                            //get the corresponding boilerplate application
                            const boilerplateCloudStorageApplication = boilerplateCloudStorageApplications[connector.resources.type]
                            // if there is not a cloudStorageApplication of type 'azure.blob' | 'googlecloud' | 'sftp' | aws3
                            // then create cloudStorageApplication
                            //TODO:  updating App interface in sdk
                            if (!remoteCloudStorageApplication) {
                                remoteCloudStorageApplication = (await bOps.applications.create({
                                    configValues: boilerplateCloudStorageApplication.configValues,
                                    connectorId: connector.id,
                                    description: boilerplateCloudStorageApplication.description,
                                    // @ts-ignore
                                    isDataProducer: true, //TODO: takeaway ts ignore by updating App interface in sdk
                                    name: connector.name
                                }));

                            } else {
                                // if there is a cloudStorageApplication of type 'azure.blob' | 'googlecloud' | 'sftp' | aws3
                                // adjust the model so that we can work with it
                                const viewModelRemoteCSApp = getAppViewModel(remoteCloudStorageApplication);
                                const viewModelCSApp = getAppViewModel(connector);

                                const boilerplateCloudStorageApplication = boilerplateCloudStorageApplications[connector.resources.type]

                                // check if they are not equal and update to boilerplate Cloud Storage Application
                                if (!(_.isEqual(viewModelRemoteCSApp, viewModelCSApp))) {

                                     //TODO: takeaway green line & ts-ignore by updating App interface in sdk
                                    remoteCloudStorageApplication = (await bOps.applications.for(remoteCloudStorageApplication.id).update({
                                        configValues: boilerplateCloudStorageApplication.configValues,
                                        description: boilerplateCloudStorageApplication.description,
                                        name: connector.name,
                                        // @ts-ignore
                                        isDataProducer: true
                                    }))
                                }
                            }

                            const remoteCloudStorageApplicationId = remoteCloudStorageApplication.id
                            const remoteCloudStorageEvents = await bOps.applications.for(remoteCloudStorageApplicationId).dataevents.getAll()

                            let remoteCloudStorageEventIdForApplication = (remoteCloudStorageEvents?.find(event => event.name === `${boilerplateCloudStorageEvent.payload.name} ${remoteCloudStorageApplication.name}`))?.id

                            const adjustedBoilerplateEventRecord = adjustBoilerplateEventForPurposeIdsAndName(remoteCloudStorageApplication)
                            const adjustedBoilerplateEvent = adjustedBoilerplateEventRecord.payload

                            // if there is no id for the remote cloud storage event, create it
                            if (!remoteCloudStorageEventIdForApplication) {
                                const createdCloudStorageEvent = await createCloudStorageEvent(adjustedBoilerplateEvent, remoteCloudStorageApplication);
                                remoteCloudStorageEventIdForApplication = createdCloudStorageEvent.id;
                            }

                            // get the eventId && check if it is the same as boilerplate
                            const remoteCloudStorageEventForApplication = await bOps.applications.for(remoteCloudStorageApplicationId).dataevents.for(remoteCloudStorageEventIdForApplication).get();

                            const adjustedRemoteEventForComparisonWithAdjustedBpEvent = adjustRemoteEventForComparisonWithAdjustedBpEvent(adjustedBoilerplateEvent, remoteCloudStorageEventForApplication);

                            if (!isEqual(adjustedRemoteEventForComparisonWithAdjustedBpEvent, adjustedBoilerplateEvent)) {
                                await updateRemoteCloudStorageEvent(adjustedBoilerplateEvent, remoteCloudStorageApplicationId, remoteCloudStorageEventIdForApplication);
                            }

                            await checkToUpdateOrCreateMappings(remoteCloudStorageEventIdForApplication, boilerplateCloudStorageEvent.mapping, remoteCloudStorageApplicationId);
                        })
                        console.log('~~~~~~~ CloudStorage Application, Events and Mappings are aligned!');
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
                        let audiencePromise: Promise<Audience>
                        const view = await bOps.views.getAll().then(views => views.find(v => v.type == "Marketing"));
                        const vOps = bOps.views.for(view.id);

                        const bUnitPurposes = await bOps.purposes.getAll()
                        const audiencePurposeIds = boilerplateAudience.purposeIds.map(purposeName => bUnitPurposes.find(p => p.name == purposeName).id).filter(Boolean);

                        const remoteAudience = await vOps.audiences.getAll().then(audiences => audiences.find(a => a.name == boilerplateAudience.name))

                        const normalizedBoilerplateAudienceForPurposeIds =
                            {
                                ...boilerplateAudience,
                                purposeIds: audiencePurposeIds
                            }

                        if (remoteAudience) {
                            if (isEqual(remoteAudience, normalizedBoilerplateAudienceForPurposeIds)) {
                                audiencePromise = Promise.resolve(remoteAudience);
                            } else {
                                audiencePromise = vOps.audiences.for(remoteAudience.id).update({
                                    ...normalizedBoilerplateAudienceForPurposeIds
                                });
                            }
                        } else {
                            audiencePromise = vOps.audiences.create({
                                ...normalizedBoilerplateAudienceForPurposeIds
                            });
                        }

                        const alignedAudience = await audiencePromise
                        console.log('~~~~~ Audience aligned!', alignedAudience)
                    }
                },
                async alignAll() {
                    await Promise.all([
                        this.schemas.alignProfile(),
                        this.schemas.alignActivities()
                    ]);
                    await this.matchRules.alignMatchRules()
                    await this.activityIndicators.align();
                    await this.segments.align();
                    await this.purposes.align();

                    await Promise.all([
                        this.applications.alignAll(),
                        this.audiences.align()
                    ]);
                },
                async ingestFakeEvents(customersNum: number, events: DirectEventName[]) {
                    terminal.magenta(`~~~~~~~~ ingesting faked events`);
                    console.log('ugejhfhjdhab')
                    // TODO: zoe + Baryo
                    // how many customers will be generated
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
