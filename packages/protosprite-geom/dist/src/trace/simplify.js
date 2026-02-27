import simplify from 'simplify-js';
import { Vec2Data } from '../core/data.js';

function simplifyPolygon(polygon, tolerance, highQuality = true) {
    if (polygon.length < 3)
        return polygon;
    const points = polygon.map((v) => ({ x: v.x, y: v.y }));
    const simplified = simplify(points, tolerance, highQuality);
    return simplified.map((p) => {
        const v = new Vec2Data();
        v.x = p.x;
        v.y = p.y;
        return v;
    });
}

export { simplifyPolygon };
//# sourceMappingURL=simplify.js.map
