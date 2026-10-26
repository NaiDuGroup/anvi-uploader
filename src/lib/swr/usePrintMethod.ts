import useSWR, { type KeyedMutator } from "swr";
import { dtfRequest } from "@/lib/dtf/dtfClientApi";
import { PRINT_METHOD_API, type PrintMethodResponse } from "@/lib/printMethods/dto";
import type { PrintMethodCode } from "@/lib/printMethods/methods";

const SWR_OPTIONS = { dedupingInterval: 5000, revalidateOnFocus: false } as const;

export type PrintMethodResource<C extends PrintMethodCode> = {
  data: PrintMethodResponse<C> | undefined;
  error: unknown;
  isLoading: boolean;
  mutate: KeyedMutator<PrintMethodResponse<C>>;
};

/** A print method with its settings and whole price list (admin «прайс и нормы» page). */
export function usePrintMethod<C extends PrintMethodCode>(code: C): PrintMethodResource<C> {
  const { data, error, isLoading, mutate } = useSWR<PrintMethodResponse<C>>(
    PRINT_METHOD_API.method(code),
    (key: string) => dtfRequest<PrintMethodResponse<C>>(key),
    SWR_OPTIONS,
  );
  return { data, error: error as unknown, isLoading, mutate };
}
