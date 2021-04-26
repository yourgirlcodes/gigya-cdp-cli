import {Payload} from "../../gigya-cdp-sdk/entities/common";
import {Event, EventType} from "../../gigya-cdp-sdk/entities/Event";
import {PurposeName} from "../purposes/purposes";
import {FieldName} from "../../gigya-cdp-sdk/entities";


interface EventConfig {
    payload: Payload<Event>,
    mapping: Record<'Profile', Array<{
        sourceField: FieldName;
        targetField: FieldName;
    }>>;
}

//TODO: fix CloudStorage Type (schemaId---> make a 'WithSchemaId' in entities so that we can omit it here from Event)

export const boilerplateCloudStorageEvent: EventConfig = {
    //@ts-ignore
    payload: {
        dataType: EventType.firstPartyCrmData,
        description: " ",
        enabled: true,
        name: "New Customers from ",
        configValues: {
            readFileNameRegex: "mock",
            readFilePath: "mock"
        },
        purposeIds: ["basic"] as Array<PurposeName>,
        schema: {
            type: 'object',
            properties: {
                firstName: {
                    type: 'string'
                },
                primaryEmail: {
                    type: 'string'
                },
                primaryPhone: {
                    type: 'string'
                },
                purchasePrice: {
                    type: 'number'
                },
                orderId: {
                    type: 'string'
                },
                masterDataId: {
                        type: 'string'
                },
                birthdate: {
                    type: "string",
                    format: "date"
                },
                gender: {
                    type: "string"
                },
                pageUrl: {
                    type: 'string'
                },
                sessionTime: {
                    type: 'number'
                }
            }
        }
    },
    mapping: {
        'Profile': [
            {
                'sourceField': 'firstName',
                'targetField': 'firstName'
            },
            {
                'sourceField': 'primaryEmail',
                'targetField': 'primaryEmail'
            },
            {
                'sourceField': 'primaryPhone',
                'targetField': 'primaryPhone'
            },
            {
                'sourceField': 'masterDataId',
                'targetField': 'masterDataId'
            },
            {
                'sourceField': 'birthdate',
                'targetField': 'birthdate'
            },
            {
                'sourceField': 'gender',
                'targetField': 'gender'
            }
        ],
    }
}
