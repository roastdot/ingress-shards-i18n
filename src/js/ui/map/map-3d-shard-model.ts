type ModelPoint = readonly [number, number, number];
type ModelColor = readonly [number, number, number, number];

interface MeshData {
    positions: number[];
    normals: number[];
    colors: number[];
}

const MODEL_BOTTOM_METERS = -2.2;

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

function addTriangle(
    mesh: MeshData,
    a: ModelPoint,
    b: ModelPoint,
    c: ModelPoint,
    color: ModelColor,
): void {
    const normal = faceNormal(a, b, c);
    for (const point of [a, b, c]) {
        mesh.positions.push(...point);
        mesh.normals.push(...normal);
        mesh.colors.push(...color);
    }
}

function createCrystalMeshes(): [MeshData, MeshData] {
    const upper: MeshData = { positions: [], normals: [], colors: [] };
    const lower: MeshData = { positions: [], normals: [], colors: [] };
    const top: ModelPoint = [0, 0.45, 0];
    const bottom: ModelPoint = [0, -0.95, 0];
    const east: ModelPoint = [0.85, 0, 0];
    const north: ModelPoint = [0, 0, 0.85];
    const west: ModelPoint = [-0.85, 0, 0];
    const south: ModelPoint = [0, 0, -0.85];
    const upperFaces: ReadonlyArray<readonly [ModelPoint, ModelPoint, ModelPoint, ModelColor]> = [
        [top, north, east, [0.42, 0.42, 0.5, 1]],
        [top, west, north, [0.72, 0.69, 0.82, 1]],
        [top, south, west, [1, 0.94, 1, 1]],
        [top, east, south, [0.55, 0.52, 0.66, 1]],
    ];
    const lowerFaces: ReadonlyArray<readonly [ModelPoint, ModelPoint, ModelPoint, ModelColor]> = [
        [bottom, east, north, [0.7, 0.62, 0.82, 1]],
        [bottom, north, west, [1, 0.88, 1, 1]],
        [bottom, west, south, [0.52, 0.43, 0.69, 1]],
        [bottom, south, east, [0.82, 0.68, 0.94, 1]],
    ];
    for (const [a, b, c, color] of upperFaces) addTriangle(upper, a, b, c, color);
    for (const [a, b, c, color] of lowerFaces) addTriangle(lower, a, b, c, color);
    return [upper, lower];
}

function createBeamMesh(radius: number, color: ModelColor): MeshData {
    const mesh: MeshData = { positions: [], normals: [], colors: [] };
    const topY = -0.9;
    const topRadius = radius * 0.45;
    const top: ModelPoint[] = [
        [topRadius, topY, 0],
        [0, topY, topRadius],
        [-topRadius, topY, 0],
        [0, topY, -topRadius],
    ];
    const bottom: ModelPoint[] = [
        [radius, MODEL_BOTTOM_METERS, 0],
        [0, MODEL_BOTTOM_METERS, radius],
        [-radius, MODEL_BOTTOM_METERS, 0],
        [0, MODEL_BOTTOM_METERS, -radius],
    ];
    for (let index = 0; index < 4; index++) {
        const next = (index + 1) % 4;
        addTriangle(mesh, top[index], bottom[index], bottom[next], color);
        addTriangle(mesh, top[index], bottom[next], top[next], color);
    }
    return mesh;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function positionBounds(positions: number[]): { min: number[]; max: number[] } {
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let index = 0; index < positions.length; index += 3) {
        for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], positions[index + axis]);
            max[axis] = Math.max(max[axis], positions[index + axis]);
        }
    }
    return { min, max };
}

function createShardModelUri(): string {
    const meshes = [
        ...createCrystalMeshes(),
        createBeamMesh(0.13, [1, 0.03, 0.3, 0.5]),
        createBeamMesh(0.045, [0.08, 0.58, 1, 0.9]),
    ];
    const arrays = meshes.flatMap(mesh => [
        new Float32Array(mesh.positions),
        new Float32Array(mesh.normals),
        new Float32Array(mesh.colors),
    ]);
    const byteLength = arrays.reduce((total, array) => total + array.byteLength, 0);
    const binary = new Uint8Array(byteLength);
    const bufferViews: Array<Record<string, number>> = [];
    let byteOffset = 0;
    for (const array of arrays) {
        binary.set(new Uint8Array(array.buffer), byteOffset);
        bufferViews.push({
            buffer: 0,
            byteOffset,
            byteLength: array.byteLength,
            target: 34962,
        });
        byteOffset += array.byteLength;
    }

    const accessors = meshes.flatMap((mesh, meshIndex) => {
        const base = meshIndex * 3;
        const bounds = positionBounds(mesh.positions);
        return [
            {
                bufferView: base,
                componentType: 5126,
                count: mesh.positions.length / 3,
                type: "VEC3",
                ...bounds,
            },
            {
                bufferView: base + 1,
                componentType: 5126,
                count: mesh.normals.length / 3,
                type: "VEC3",
            },
            {
                bufferView: base + 2,
                componentType: 5126,
                count: mesh.colors.length / 4,
                type: "VEC4",
            },
        ];
    });
    const primitives = meshes.map((_mesh, meshIndex) => ({
        attributes: {
            POSITION: meshIndex * 3,
            NORMAL: meshIndex * 3 + 1,
            COLOR_0: meshIndex * 3 + 2,
        },
        material: meshIndex,
        mode: 4,
    }));

    const gltf = {
        asset: { version: "2.0", generator: "Ingress Shards Map" },
        extensionsUsed: ["KHR_materials_unlit"],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives }],
        materials: [
            {
                name: "Faceted crystal",
                pbrMetallicRoughness: {
                    baseColorFactor: [0.2, 0.16, 0.29, 1],
                    metallicFactor: 0.68,
                    roughnessFactor: 0.17,
                },
                emissiveFactor: [0.012, 0.006, 0.025],
                doubleSided: true,
            },
            {
                name: "Faceted crystal lower",
                pbrMetallicRoughness: {
                    baseColorFactor: [0.33, 0.16, 0.52, 1],
                    metallicFactor: 0.42,
                    roughnessFactor: 0.22,
                },
                emissiveFactor: [0.035, 0.008, 0.07],
                doubleSided: true,
            },
            {
                name: "XM beam outer",
                extensions: { KHR_materials_unlit: {} },
                pbrMetallicRoughness: { baseColorFactor: [1, 0.03, 0.3, 0.5] },
                alphaMode: "BLEND",
                doubleSided: true,
            },
            {
                name: "XM beam core",
                extensions: { KHR_materials_unlit: {} },
                pbrMetallicRoughness: { baseColorFactor: [0.08, 0.58, 1, 0.9] },
                alphaMode: "BLEND",
                doubleSided: true,
            },
        ],
        buffers: [{
            byteLength: binary.byteLength,
            uri: `data:application/octet-stream;base64,${bytesToBase64(binary)}`,
        }],
        bufferViews,
        accessors,
    };

    return `data:model/gltf+json;base64,${btoa(JSON.stringify(gltf))}`;
}

export const SHARD_MODEL_SCALE = 5;
export const SHARD_MODEL_GROUND_OFFSET_METERS = -MODEL_BOTTOM_METERS * SHARD_MODEL_SCALE;
export const SHARD_MODEL_URI = createShardModelUri();
