import { create } from '@bufbuild/protobuf';
import { Vec2Schema, PolygonSchema, ConvexDecompositionSchema, FrameLayerGeometrySchema, CompositeFrameGeometrySchema, FrameGeometrySchema, SpriteGeometryEntrySchema, SpriteGeometrySchema } from '../../proto_dist/sprite_geometry_pb.js';

class Vec2Data {
    x = 0;
    y = 0;
    static fromProto(proto) {
        const instance = new Vec2Data();
        instance.x = proto.x;
        instance.y = proto.y;
        return instance;
    }
    toProto(protoIn) {
        const proto = protoIn ?? create(Vec2Schema);
        proto.x = this.x;
        proto.y = this.y;
        return proto;
    }
    clone() {
        const other = new Vec2Data();
        other.x = this.x;
        other.y = this.y;
        return other;
    }
}
class PolygonData {
    vertices = [];
    static fromProto(proto) {
        const instance = new PolygonData();
        instance.vertices = proto.vertices.map(Vec2Data.fromProto);
        return instance;
    }
    toProto(protoIn) {
        const proto = protoIn ?? create(PolygonSchema);
        proto.vertices = this.vertices.map((v) => v.toProto());
        return proto;
    }
    clone() {
        const other = new PolygonData();
        other.vertices = this.vertices.map((v) => v.clone());
        return other;
    }
}
class ConvexDecompositionData {
    components = [];
    static fromProto(proto) {
        const instance = new ConvexDecompositionData();
        instance.components = proto.components.map(PolygonData.fromProto);
        return instance;
    }
    toProto(protoIn) {
        const proto = protoIn ?? create(ConvexDecompositionSchema);
        proto.components = this.components.map((c) => c.toProto());
        return proto;
    }
    clone() {
        const other = new ConvexDecompositionData();
        other.components = this.components.map((c) => c.clone());
        return other;
    }
}
class FrameLayerGeometryData {
    layerIndex = 0;
    polygons = [];
    convexDecompositions = [];
    static fromProto(proto) {
        const instance = new FrameLayerGeometryData();
        instance.layerIndex = proto.layerIndex;
        instance.polygons = proto.polygons.map(PolygonData.fromProto);
        instance.convexDecompositions = proto.convexDecompositions.map(ConvexDecompositionData.fromProto);
        return instance;
    }
    toProto(protoIn) {
        const proto = protoIn ?? create(FrameLayerGeometrySchema);
        proto.layerIndex = this.layerIndex;
        proto.polygons = this.polygons.map((p) => p.toProto());
        proto.convexDecompositions = this.convexDecompositions.map((d) => d.toProto());
        return proto;
    }
    clone() {
        const other = new FrameLayerGeometryData();
        other.layerIndex = this.layerIndex;
        other.polygons = this.polygons.map((p) => p.clone());
        other.convexDecompositions = this.convexDecompositions.map((d) => d.clone());
        return other;
    }
}
class CompositeFrameGeometryData {
    polygons = [];
    convexDecompositions = [];
    static fromProto(proto) {
        const instance = new CompositeFrameGeometryData();
        instance.polygons = proto.polygons.map(PolygonData.fromProto);
        instance.convexDecompositions = proto.convexDecompositions.map(ConvexDecompositionData.fromProto);
        return instance;
    }
    toProto(protoIn) {
        const proto = protoIn ?? create(CompositeFrameGeometrySchema);
        proto.polygons = this.polygons.map((p) => p.toProto());
        proto.convexDecompositions = this.convexDecompositions.map((d) => d.toProto());
        return proto;
    }
    clone() {
        const other = new CompositeFrameGeometryData();
        other.polygons = this.polygons.map((p) => p.clone());
        other.convexDecompositions = this.convexDecompositions.map((d) => d.clone());
        return other;
    }
}
class FrameGeometryData {
    frameIndex = 0;
    layers = [];
    composite;
    static fromProto(proto) {
        const instance = new FrameGeometryData();
        instance.frameIndex = proto.frameIndex;
        instance.layers = proto.layers.map(FrameLayerGeometryData.fromProto);
        instance.composite = proto.composite
            ? CompositeFrameGeometryData.fromProto(proto.composite)
            : undefined;
        return instance;
    }
    toProto(protoIn) {
        const proto = protoIn ?? create(FrameGeometrySchema);
        proto.frameIndex = this.frameIndex;
        proto.layers = this.layers.map((l) => l.toProto());
        proto.composite = this.composite?.toProto();
        return proto;
    }
    clone() {
        const other = new FrameGeometryData();
        other.frameIndex = this.frameIndex;
        other.layers = this.layers.map((l) => l.clone());
        other.composite = this.composite?.clone();
        return other;
    }
}
class SpriteGeometryEntryData {
    spriteName = "";
    frames = [];
    simplifyTolerance = 1.0;
    static fromProto(proto) {
        const instance = new SpriteGeometryEntryData();
        instance.spriteName = proto.spriteName;
        instance.frames = proto.frames.map(FrameGeometryData.fromProto);
        instance.simplifyTolerance = proto.simplifyTolerance;
        return instance;
    }
    toProto(protoIn) {
        const proto = protoIn ?? create(SpriteGeometryEntrySchema);
        proto.spriteName = this.spriteName;
        proto.frames = this.frames.map((f) => f.toProto());
        proto.simplifyTolerance = this.simplifyTolerance;
        return proto;
    }
    clone() {
        const other = new SpriteGeometryEntryData();
        other.spriteName = this.spriteName;
        other.frames = this.frames.map((f) => f.clone());
        other.simplifyTolerance = this.simplifyTolerance;
        return other;
    }
}
class SpriteGeometryData {
    entries = [];
    spriteSource;
    static fromProto(proto) {
        const instance = new SpriteGeometryData();
        instance.entries = proto.entries.map(SpriteGeometryEntryData.fromProto);
        switch (proto.spriteSource.case) {
            case "embeddedPrs":
                instance.spriteSource = {
                    type: "embedded",
                    prsData: proto.spriteSource.value
                };
                break;
            case "externalPrsFile":
                instance.spriteSource = {
                    type: "externalFile",
                    fileName: proto.spriteSource.value
                };
                break;
            case "externalPrsUrl":
                instance.spriteSource = {
                    type: "externalUrl",
                    url: proto.spriteSource.value
                };
                break;
        }
        return instance;
    }
    toProto(protoIn) {
        const proto = protoIn ?? create(SpriteGeometrySchema);
        proto.entries = this.entries.map((e) => e.toProto());
        if (this.spriteSource) {
            switch (this.spriteSource.type) {
                case "embedded":
                    proto.spriteSource = {
                        case: "embeddedPrs",
                        value: this.spriteSource.prsData
                    };
                    break;
                case "externalFile":
                    proto.spriteSource = {
                        case: "externalPrsFile",
                        value: this.spriteSource.fileName
                    };
                    break;
                case "externalUrl":
                    proto.spriteSource = {
                        case: "externalPrsUrl",
                        value: this.spriteSource.url
                    };
                    break;
            }
        }
        return proto;
    }
    clone() {
        const other = new SpriteGeometryData();
        other.entries = this.entries.map((e) => e.clone());
        if (this.spriteSource) {
            if (this.spriteSource.type === "embedded") {
                other.spriteSource = {
                    type: "embedded",
                    prsData: new Uint8Array(this.spriteSource.prsData)
                };
            }
            else {
                other.spriteSource = { ...this.spriteSource };
            }
        }
        return other;
    }
}

export { CompositeFrameGeometryData, ConvexDecompositionData, FrameGeometryData, FrameLayerGeometryData, PolygonData, SpriteGeometryData, SpriteGeometryEntryData, Vec2Data };
//# sourceMappingURL=data.js.map
