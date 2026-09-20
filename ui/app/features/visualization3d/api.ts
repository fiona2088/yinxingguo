import { createVisualization3DData } from "./dataAdapter";
import { BuildingMetric, Visualization3DData } from "./types";

type Visualization3DApiResponse = {
    buildings?: Array<Partial<BuildingMetric>>;
    stats?: Visualization3DData["stats"];
};

function mapApiBuildings(source: Visualization3DApiResponse["buildings"]): BuildingMetric[] {
    if (!source || source.length === 0) {
        return [];
    }

    return source.map((item, index) => ({
        id: item.id || `api-building-${index + 1}`,
        name: item.name || `Building-${index + 1}`,
        electricity: Number(item.electricity ?? 0),
        hvac: Number(item.hvac ?? 0),
        lighting: Number(item.lighting ?? 0),
        equipment: Number(item.equipment ?? 0),
        position: item.position ?? [index * 1.2 - 2.4, 0, (index % 2) * 1.8],
        color: item.color || "#38bdf8",
        buildingType: item.buildingType,
    }));
}

export async function fetchVisualization3DDataFromApi(endpoint: string, init?: RequestInit) {
    const response = await fetch(endpoint, init);
    if (!response.ok) {
        throw new Error(`visualization data request failed: ${response.status}`);
    }

    const payload = (await response.json()) as Visualization3DApiResponse;

    return createVisualization3DData({
        buildings: mapApiBuildings(payload.buildings),
        stats: payload.stats,
    });
}
