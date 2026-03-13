import { api } from "./api";

export async function issueSearchToken() {
  const res = await api.get("/me/search-token");
  return String(res.data?.token ?? "");
}
