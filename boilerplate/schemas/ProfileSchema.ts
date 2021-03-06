import {JSONSchema7} from "json-schema";
import {ProfileFieldName} from "../../gigya-cdp-sdk/entities";

export const profileSchema: JSONSchema7 = {
    type: 'object',
    properties: {
        "firstName": {type: "string"},
        "primaryEmail": {type: "string"},
        "primaryPhone": {type: "string"},
        "masterDataId": {type: ["string"]},
        "gender": {type: "string"},
        "birthdate": {type: "string", format: "date"},
    }
};
