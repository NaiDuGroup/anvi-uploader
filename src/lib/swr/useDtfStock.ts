import useSWR, { type KeyedMutator } from "swr";
import {
  DTF_API,
  dtfRequest,
  type ConsumablesResponse,
  type GarmentListResponse,
  type PresetListResponse,
  type SettingsResponse,
} from "@/lib/dtf/dtfClientApi";

const SWR_OPTIONS = { dedupingInterval: 5000, revalidateOnFocus: false } as const;

type DtfResource<T> = {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  mutate: KeyedMutator<T>;
};

function useDtfResource<T>(url: string): DtfResource<T> {
  const { data, error, isLoading, mutate } = useSWR<T>(url, (key: string) => dtfRequest<T>(key), SWR_OPTIONS);
  return { data, error: error as unknown, isLoading, mutate };
}

export function useDtfGarments(): DtfResource<GarmentListResponse> {
  return useDtfResource<GarmentListResponse>(DTF_API.garments);
}

export function useDtfConsumables(): DtfResource<ConsumablesResponse> {
  return useDtfResource<ConsumablesResponse>(DTF_API.consumables);
}

export function useDtfPresets(): DtfResource<PresetListResponse> {
  return useDtfResource<PresetListResponse>(DTF_API.presets);
}

export function useDtfSettings(): DtfResource<SettingsResponse> {
  return useDtfResource<SettingsResponse>(DTF_API.settings);
}
