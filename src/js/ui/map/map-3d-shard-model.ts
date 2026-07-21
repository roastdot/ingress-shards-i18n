type ModelPoint = readonly [number, number, number];

const MODEL_HEIGHT_METERS = 2;

function faceNormal(a: ModelPoint, b: ModelPoint, c: ModelPoint): ModelPoint {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(cross[0], cross[1], cross[2]);
    return [cross[0] / length, cross[1] / length, cross[2] / length];
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function createShardModelUri(): string {
    // glTF uses Y-up. Cesium rotates that axis onto the local terrain normal.
    const top: ModelPoint = [0, 1.1, 0];
    const bottom: ModelPoint = [0, -0.9, 0];
    const east: ModelPoint = [0.9, 0, 0];
    const north: ModelPoint = [0, 0, 0.9];
    const west: ModelPoint = [-0.9, 0, 0];
    const south: ModelPoint = [0, 0, -0.9];
    const faces: ReadonlyArray<readonly [ModelPoint, ModelPoint, ModelPoint]> = [
        [top, north, east],
        [top, west, north],
        [top, south, west],
        [top, east, south],
        [bottom, east, north],
        [bottom, north, west],
        [bottom, west, south],
        [bottom, south, east],
    ];

    const positions: number[] = [];
    const normals: number[] = [];
    for (const face of faces) {
        const normal = faceNormal(...face);
        for (const point of face) {
            positions.push(...point);
            normals.push(...normal);
        }
    }

    const positionData = new Float32Array(positions);
    const normalData = new Float32Array(normals);
    const binary = new Uint8Array(positionData.byteLength + normalData.byteLength);
    binary.set(new Uint8Array(positionData.buffer), 0);
    binary.set(new Uint8Array(normalData.buffer), positionData.byteLength);

    const gltf = {
        asset: { version: "2.0", generator: "Ingress Shards Map" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{
            primitives: [{
                attributes: { POSITION: 0, NORMAL: 1 },
                material: 0,
                mode: 4,
            }],
        }],
        materials: [{
            name: "XM shard crystal",
            pbrMetallicRoughness: {
                baseColorFactor: [0.34, 0.04, 0.58, 0.9],
                metallicFactor: 0.35,
                roughnessFactor: 0.24,
            },
            emissiveFactor: [0.16, 0.015, 0.28],
            alphaMode: "BLEND",
            doubleSided: true,
        }],
        buffers: [{
            byteLength: binary.byteLength,
            uri: `data:application/octet-stream;base64,${bytesToBase64(binary)}`,
        }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: positionData.byteLength, target: 34962 },
            {
                buffer: 0,
                byteOffset: positionData.byteLength,
                byteLength: normalData.byteLength,
                target: 34962,
            },
        ],
        accessors: [
            {
                bufferView: 0,
                componentType: 5126,
                count: positions.length / 3,
                type: "VEC3",
                min: [-0.9, -0.9, -0.9],
                max: [0.9, 1.1, 0.9],
            },
            {
                bufferView: 1,
                componentType: 5126,
                count: normals.length / 3,
                type: "VEC3",
            },
        ],
    };

    return `data:model/gltf+json;base64,${btoa(JSON.stringify(gltf))}`;
}

export const SHARD_MODEL_SCALE = 3;
export const SHARD_MODEL_GROUND_OFFSET_METERS = MODEL_HEIGHT_METERS * SHARD_MODEL_SCALE / 2;
export const SHARD_MODEL_URI = createShardModelUri();
