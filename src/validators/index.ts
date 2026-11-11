// Shared contracts are also compiled by Cloud Functions. Never import Admin SDK here.
export {
  catalogSchema,
  projectSchema,
  movementSchema,
} from "../../functions/src/domain";
