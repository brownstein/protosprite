import { ProtoSpriteThree } from "protosprite-three";
import { SpriteGeometryEntryData } from "protosprite-geom";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
} from "three";

export class GeometryOverlay {
  public readonly linesMesh: LineSegments;

  private sprite: ProtoSpriteThree;
  private geomEntry: SpriteGeometryEntryData;
  private geometry: BufferGeometry;
  private material: LineBasicMaterial;
  private unsubscribe: (() => void) | null = null;

  constructor(sprite: ProtoSpriteThree, geomEntry: SpriteGeometryEntryData) {
    this.sprite = sprite;
    this.geomEntry = geomEntry;
    this.geometry = new BufferGeometry();
    this.material = new LineBasicMaterial({ color: 0x00ff00 });
    this.linesMesh = new LineSegments(this.geometry, this.material);
    this.linesMesh.scale.y = -1;

    this.rebuildGeometry();

    const handler = () => this.rebuildGeometry();
    this.sprite.events.on("animationFrameSwapped", handler);
    this.unsubscribe = () =>
      this.sprite.events.off("animationFrameSwapped", handler);
  }

  private rebuildGeometry() {
    const currentFrame = this.sprite.protoSpriteInstance.animationState.currentFrame;
    const frameGeom = this.geomEntry.frames.find(
      (f) => f.frameIndex === currentFrame
    );

    if (!frameGeom || !frameGeom.composite) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const offset = this.sprite.centerOffset;
    const shapePool = this.geomEntry.shapePool;
    const vertexPool = this.geomEntry.vertexPool;

    // Resolve indexed polygons through vertex pool
    const resolvedPolygons = frameGeom.composite.shapeIndices.map((idx) => {
      const shape = shapePool[idx];
      return shape.polygon.vertexIndices.map((vi) => vertexPool[vi]);
    });

    // Count total line segments needed
    let segmentCount = 0;
    for (const verts of resolvedPolygons) {
      if (verts.length >= 2) segmentCount += verts.length;
    }

    const posArr = new Float32Array(segmentCount * 2 * 3); // 2 verts per segment, 3 components
    let vi = 0;
    const z = 0.5;

    for (const verts of resolvedPolygons) {
      if (verts.length < 2) continue;
      for (let i = 0; i < verts.length; i++) {
        const curr = verts[i];
        const next = verts[(i + 1) % verts.length];

        posArr[vi++] = offset.x + curr.x;
        posArr[vi++] = offset.y + curr.y;
        posArr[vi++] = z;

        posArr[vi++] = offset.x + next.x;
        posArr[vi++] = offset.y + next.y;
        posArr[vi++] = z;
      }
    }

    this.geometry.setAttribute(
      "position",
      new BufferAttribute(posArr, 3)
    );
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.setDrawRange(0, segmentCount * 2);
    this.geometry.computeBoundingSphere();
  }

  syncPosition() {
    this.linesMesh.position.copy(this.sprite.mesh.position);
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.geometry.dispose();
    this.material.dispose();
  }
}
