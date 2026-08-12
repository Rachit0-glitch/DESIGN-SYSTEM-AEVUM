import {
  ActorRefSchema,
  AssetSchema,
  CameraSchema,
  CameraPathSchema,
  CanonicalDesignDocumentSchema,
  CinematicSequenceSchema,
  CinematicShotSchema,
  DesignNodeSchema,
  EntityIdSchema,
  LightSchema,
  EnvironmentSchema,
  LightingProfileSchema,
  LightingRigSchema,
  LightingBakeSchema,
  ReflectionProbeSchema,
  MaterialSchema,
  ReferenceRecordSchema,
  TimelineSchema,
} from "@aevum/document-model";
import { z } from "zod";

export const CURRENT_COMMAND_VERSION = "1.0.0" as const;

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export const CommandIdSchema = z.string().regex(new RegExp(`^cmd_${uuidPattern}$`, "i"));
export const TransactionIdSchema = z.string().regex(new RegExp(`^tx_${uuidPattern}$`, "i"));
const IsoDateSchema = z.iso.datetime({ offset: true });
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const BaseCommandShape = {
  id: CommandIdSchema,
  commandVersion: z.literal(CURRENT_COMMAND_VERSION),
  documentId: EntityIdSchema,
  expectedDocumentVersion: z.number().int().nonnegative(),
  timestamp: IsoDateSchema,
  actor: ActorRefSchema,
  correlationId: z.string().min(1),
  transactionId: TransactionIdSchema,
};

export const CreateDocumentCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("document.create"),
  payload: z.strictObject({ document: CanonicalDesignDocumentSchema }),
});
export const RenameDocumentCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("document.rename"),
  payload: z.strictObject({ name: z.string().trim().min(1).max(255) }),
});
export const CreatePageCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("page.create"),
  payload: z.strictObject({ page: DesignNodeSchema, index: z.number().int().nonnegative().optional() }),
});
export const DeletePageCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("page.delete"),
  payload: z.strictObject({ pageId: EntityIdSchema }),
});
export const RenamePageCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("page.rename"),
  payload: z.strictObject({ pageId: EntityIdSchema, name: z.string().trim().min(1).max(255) }),
});
export const CreateNodeCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("node.create"),
  payload: z.strictObject({ node: DesignNodeSchema, index: z.number().int().nonnegative().optional() }),
});
export const CreateRigCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("rig.create"),
  payload: z.strictObject({ rig: DesignNodeSchema, bones: z.array(DesignNodeSchema).min(1).max(256) }),
});
export const DeleteNodeCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("node.delete"),
  payload: z.strictObject({ nodeId: EntityIdSchema }),
});
export const MoveNodeCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("node.move"),
  payload: z.strictObject({ nodeId: EntityIdSchema, index: z.number().int().nonnegative() }),
});
export const ReparentNodeCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("node.reparent"),
  payload: z.strictObject({
    nodeId: EntityIdSchema,
    parentId: EntityIdSchema.nullable(),
    index: z.number().int().nonnegative(),
  }),
});
export const DuplicateNodeCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("node.duplicate"),
  payload: z.strictObject({
    sourceNodeId: EntityIdSchema,
    parentId: EntityIdSchema.nullable(),
    index: z.number().int().nonnegative(),
    idMap: z.record(EntityIdSchema, EntityIdSchema),
    name: z.string().trim().min(1).max(255).optional(),
  }),
});
export const UpdateNodeCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("node.update"),
  payload: z.strictObject({ nodeId: EntityIdSchema, changes: z.record(z.string(), JsonValueSchema) }),
});
export const RegisterAssetCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("asset.register"),
  payload: z.strictObject({ asset: AssetSchema }),
});
export const RemoveAssetCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("asset.remove"),
  payload: z.strictObject({ assetId: EntityIdSchema }),
});
export const RegisterReferenceCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("reference.register"),
  payload: z.strictObject({ reference: ReferenceRecordSchema }),
});
export const CreateTimelineCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("timeline.create"),
  payload: z.strictObject({ timeline: TimelineSchema }),
});
export const UpdateTimelineCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("timeline.update"),
  payload: z.strictObject({ timeline: TimelineSchema }),
});
export const DeleteTimelineCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("timeline.delete"),
  payload: z.strictObject({ timelineId: EntityIdSchema }),
});
export const ImportScene3DCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("scene3d.import"),
  payload: z.strictObject({
    sourceAssetId: EntityIdSchema,
    rootNodeIds: z.array(EntityIdSchema).min(1),
    nodes: z.array(DesignNodeSchema).min(2),
    assets: z.array(AssetSchema),
    materials: z.array(MaterialSchema),
    cameras: z.array(CameraSchema),
    lights: z.array(LightSchema),
  }),
});
export const UpdateMaterialCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("material.update"),
  payload: z.strictObject({ material: MaterialSchema }),
});
export const UpdateCameraCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("camera.update"),
  payload: z.strictObject({ camera: CameraSchema }),
});
export const CreateCameraCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("camera.create"),
  payload: z.strictObject({
    camera: CameraSchema,
    sceneId: EntityIdSchema.optional(),
    makeActive: z.boolean().default(false),
  }),
});
export const ApplyCinematicSequenceCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("cinematic.apply_sequence"),
  payload: z.strictObject({
    sequence: CinematicSequenceSchema,
    shots: z.array(CinematicShotSchema).min(1).max(256),
    paths: z.array(CameraPathSchema).max(256),
    timelines: z.array(TimelineSchema).max(256),
  }),
});
export const UpdateLightCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("light.update"),
  payload: z.strictObject({ light: LightSchema }),
});
export const ApplyLightingRigCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("lighting.apply_rig"),
  payload: z.strictObject({
    sceneId: EntityIdSchema,
    rig: LightingRigSchema,
    lights: z.array(LightSchema).min(1).max(256),
    environment: EnvironmentSchema.optional(),
    profiles: z.array(LightingProfileSchema).min(1).max(16),
    reflectionProbes: z.array(ReflectionProbeSchema).max(64),
  }),
});
export const RegisterLightingBakeCommandSchema = z.strictObject({
  ...BaseCommandShape,
  type: z.literal("lighting.register_bake"),
  payload: z.strictObject({ asset: AssetSchema, bake: LightingBakeSchema }),
});

export type CreateDocumentCommand = z.infer<typeof CreateDocumentCommandSchema>;
export type RenameDocumentCommand = z.infer<typeof RenameDocumentCommandSchema>;
export type CreatePageCommand = z.infer<typeof CreatePageCommandSchema>;
export type DeletePageCommand = z.infer<typeof DeletePageCommandSchema>;
export type RenamePageCommand = z.infer<typeof RenamePageCommandSchema>;
export type CreateNodeCommand = z.infer<typeof CreateNodeCommandSchema>;
export type CreateRigCommand = z.infer<typeof CreateRigCommandSchema>;
export type DeleteNodeCommand = z.infer<typeof DeleteNodeCommandSchema>;
export type MoveNodeCommand = z.infer<typeof MoveNodeCommandSchema>;
export type ReparentNodeCommand = z.infer<typeof ReparentNodeCommandSchema>;
export type DuplicateNodeCommand = z.infer<typeof DuplicateNodeCommandSchema>;
export type UpdateNodeCommand = z.infer<typeof UpdateNodeCommandSchema>;
export type RegisterAssetCommand = z.infer<typeof RegisterAssetCommandSchema>;
export type RemoveAssetCommand = z.infer<typeof RemoveAssetCommandSchema>;
export type RegisterReferenceCommand = z.infer<typeof RegisterReferenceCommandSchema>;
export type CreateTimelineCommand = z.infer<typeof CreateTimelineCommandSchema>;
export type UpdateTimelineCommand = z.infer<typeof UpdateTimelineCommandSchema>;
export type DeleteTimelineCommand = z.infer<typeof DeleteTimelineCommandSchema>;
export type ImportScene3DCommand = z.infer<typeof ImportScene3DCommandSchema>;
export type UpdateMaterialCommand = z.infer<typeof UpdateMaterialCommandSchema>;
export type UpdateCameraCommand = z.infer<typeof UpdateCameraCommandSchema>;
export type CreateCameraCommand = z.infer<typeof CreateCameraCommandSchema>;
export type ApplyCinematicSequenceCommand = z.infer<typeof ApplyCinematicSequenceCommandSchema>;
export type UpdateLightCommand = z.infer<typeof UpdateLightCommandSchema>;
export type ApplyLightingRigCommand = z.infer<typeof ApplyLightingRigCommandSchema>;
export type RegisterLightingBakeCommand = z.infer<typeof RegisterLightingBakeCommandSchema>;
export type Command =
  | CreateDocumentCommand
  | RenameDocumentCommand
  | CreatePageCommand
  | DeletePageCommand
  | RenamePageCommand
  | CreateNodeCommand
  | CreateRigCommand
  | DeleteNodeCommand
  | MoveNodeCommand
  | ReparentNodeCommand
  | DuplicateNodeCommand
  | UpdateNodeCommand
  | RegisterAssetCommand
  | RemoveAssetCommand
  | RegisterReferenceCommand
  | CreateTimelineCommand
  | UpdateTimelineCommand
  | DeleteTimelineCommand
  | ImportScene3DCommand
  | UpdateMaterialCommand
  | UpdateCameraCommand
  | CreateCameraCommand
  | ApplyCinematicSequenceCommand
  | UpdateLightCommand
  | ApplyLightingRigCommand
  | RegisterLightingBakeCommand;

export const CommandSchema: z.ZodType<Command> = z.discriminatedUnion("type", [
  CreateDocumentCommandSchema,
  RenameDocumentCommandSchema,
  CreatePageCommandSchema,
  DeletePageCommandSchema,
  RenamePageCommandSchema,
  CreateNodeCommandSchema,
  CreateRigCommandSchema,
  DeleteNodeCommandSchema,
  MoveNodeCommandSchema,
  ReparentNodeCommandSchema,
  DuplicateNodeCommandSchema,
  UpdateNodeCommandSchema,
  RegisterAssetCommandSchema,
  RemoveAssetCommandSchema,
  RegisterReferenceCommandSchema,
  CreateTimelineCommandSchema,
  UpdateTimelineCommandSchema,
  DeleteTimelineCommandSchema,
  ImportScene3DCommandSchema,
  UpdateMaterialCommandSchema,
  UpdateCameraCommandSchema,
  CreateCameraCommandSchema,
  ApplyCinematicSequenceCommandSchema,
  UpdateLightCommandSchema,
  ApplyLightingRigCommandSchema,
  RegisterLightingBakeCommandSchema,
]);

export type CommandType = Command["type"];
