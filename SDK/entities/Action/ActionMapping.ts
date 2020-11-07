import {ApplicationId} from "../Application";
import {SchemaId} from "../common/schema";
import {MappingBase} from "../common/mapping";

export interface ActionMapping extends MappingBase {
  src: SchemaId | ApplicationId; // mapping either from customer schemas or from Application's configSchema
}