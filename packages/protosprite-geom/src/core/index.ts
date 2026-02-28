import * as Protos from "../../proto_dist/sprite_geometry_pb.js";
import * as Data from "./data.js";
import { ProtoSpriteGeometry } from "./protosprite-geom.js";

export { ProtoSpriteGeometry, Protos, Data };

export {
  Vec2Data,
  PolygonData,
  ConvexDecompositionData,
  ShapePoolEntryData,
  FrameLayerGeometryData,
  CompositeFrameGeometryData,
  FrameGeometryData,
  SpriteGeometryEntryData,
  SpriteGeometryData
} from "./data.js";

export type { SpriteSourceData } from "./data.js";

export type {
  ResolvedLayerGeometry,
  ResolvedCompositeGeometry,
  ResolvedFrameGeometry
} from "./protosprite-geom.js";
