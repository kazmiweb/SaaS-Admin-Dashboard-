import React, { useMemo, useState } from "react";
import { api } from "../../app/api";
import { useNavigate } from "react-router-dom";
import { downloadClientPdf, downloadCsv } from "../../utils/export";

type Tab = "cnic" | "mobile";

export default function SearchPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("cnic");
  const [cnic, setCnic] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resp, setResp] = useState<any>(null);

  const query = useMemo(() => (tab === "cnic" ? cnic : mobile), [tab, cnic, mobile]);

  function validate(): string | null {
    if (!query.trim()) return "Please enter a value.";
    if (tab === "cnic") {
      const digits = query.replace(/[^0-9]/g, "");
      if (digits.length !== 13) return "CNIC must be 13 digits.";
    }
    if (tab === "mobile") {
      const m = query.replace(/\s+/g, "");
      if (!/^03\d{9}$/.test(m)) return "Mobile must be 03xxxxxxxxx.";
    }
    return null;
  }

  async function run() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    setResp(null);
    setBusy(true);
    try {
      const q = tab === "cnic" ? cnic.replace(/[^0-9]/g, "") : mobile.trim();
      const r = await api.get("/search/unified", { params: { query: q } });
      setResp(r.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!resp) return;
    const r = await api.post("/export/pdf", {
      title: "Elookup Database System Report",
      query: resp.querySent,
      detectedType: resp.detectedType,
      results: resp
    }, { responseType: "blob" });

    const blob = new Blob([r.data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${resp.querySent || "elookup"}-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto">
        <div className="rounded-3xl bg-white/5 border border-white/10 shadow-2xl p-5 md:p-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-2xl">🔎</div>
              <div>
                <div className="text-2xl md:text-3xl font-extrabold text-blue-300">All in One Search</div>
                <div className="text-sm text-slate-300 mt-1">Enter exact details to retrieve official records.</div>
              </div>
            </div>
            <div className="text-sm font-mono px-4 py-2 rounded-xl bg-black/20 border border-white/10">
              {new Date().toLocaleString()}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mt-6">
            <div className="p-1 rounded-2xl bg-black/20 border border-white/10 flex gap-2">
              <button
                onClick={() => setTab("cnic")}
                className={`px-8 py-3 rounded-xl font-extrabold transition ${tab === "cnic" ? "bg-blue-600 text-white" : "text-slate-200 hover:text-white"}`}
              >
                CNIC Search
              </button>
              <button
                onClick={() => setTab("mobile")}
                className={`px-8 py-3 rounded-xl font-extrabold transition ${tab === "mobile" ? "bg-emerald-600 text-white" : "text-slate-200 hover:text-white"}`}
              >
                Mobile Search
              </button>
            </div>
          </div>

          {/* Input */}
          <div className="mt-6 text-center">
            {tab === "cnic" ? (
              <input
                value={cnic}
                onChange={(e) => setCnic(e.target.value)}
                placeholder="Enter CNIC Number (13 digits)"
                maxLength={13}
                className="w-full max-w-2xl mx-auto px-6 py-5 rounded-2xl bg-black/20 text-lg md:text-xl text-white placeholder-slate-400 border border-white/10 focus:outline-none focus:ring-4 focus:ring-blue-500/30"
              />
            ) : (
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="Enter Mobile Number (03xxxxxxxxx)"
                maxLength={11}
                className="w-full max-w-2xl mx-auto px-6 py-5 rounded-2xl bg-black/20 text-lg md:text-xl text-white placeholder-slate-400 border border-white/10 focus:outline-none focus:ring-4 focus:ring-emerald-500/30"
              />
            )}

            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <button
                onClick={run}
                disabled={busy}
                className="px-7 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-extrabold text-lg shadow-xl transition"
              >
                {busy ? "Searching..." : "🔍 Search Record"}
              </button>

              <button
                onClick={() => nav("/app")}
                className="px-7 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg shadow-xl transition"
              >
                🏠 Dashboard
              </button>
            </div>

            {err && (
              <div className="mt-4 max-w-2xl mx-auto p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
                {err}
              </div>
            )}
          </div>

          {/* Loading */}
          {busy && (
            <div className="text-center my-12">
              <div className="text-5xl animate-spin inline-block">🌀</div>
              <div className="mt-4 text-xl font-extrabold">Searching All Databases...</div>
              <div className="text-sm text-slate-400 mt-1">Please wait 10-20 seconds</div>
            </div>
          )}

          {/* Results */}
          {resp && (
            <div className="mt-8 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-300">
                  Query: <b className="text-white">{resp.querySent}</b> • Detected: <b className="text-white">{resp.detectedType}</b> • Cost: <b className="text-white">{resp.cost}</b>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={downloadPdf} className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold">
                    🖨️ Server PDF
                  </button>
                  <button
                    onClick={() =>
                      downloadClientPdf({
                        filename: `${resp.querySent || "elookup"}-client.pdf`,
                        title: "Elookup Intelligence Report",
                        subtitle: `Query: ${resp.querySent} • Detected: ${resp.detectedType}`,
                        sections: [{ heading: "API Results", rows: resp.results || [] }],
                        rawJson: resp,
                      })
                    }
                    className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold"
                  >
                    📄 Client PDF
                  </button>
                  <button
                    onClick={() => downloadCsv(`${resp.querySent || "elookup"}-results.csv`, resp.results || [])}
                    className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-extrabold"
                  >
                    ⬇️ CSV
                  </button>
                </div>
              </div>

              <div className="grid gap-4">
                {resp.results?.map((r: any) => (
                  <ResultCard key={r.apiId} item={r} />
                ))}
              </div>
            </div>
          )}

          {/* About */}
          <div className="mt-10 rounded-2xl bg-black/20 border border-white/10 p-5 text-slate-200">
            <div className="text-lg font-extrabold text-blue-200">About This Portal</div>
            <div className="text-sm text-slate-300 mt-2">
              Secure access to Elookup Database records. Exact-match search only. 1 coin per search (per API cost configurable).
            </div>
          </div>
        </div>
      </div>
    
  );
}

function ResultCard({ item }: { item: any }) {
  const ok = !!item.ok;
  const content = ok ? item.data : { error: item.error };

  async function copyAll() {
    await navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    alert("Copied");
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-extrabold text-lg">{item.apiName}</div>
          <div className="text-xs text-slate-400">Standardized view will be added via Response Mapping in API Manager.</div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${ok ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/25" : "bg-red-500/15 text-red-200 border-red-500/25"}`}>
          {ok ? "SUCCESS" : "ERROR"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={copyAll} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-bold text-sm">
          Copy All
        </button>
      </div>

      <pre className="mt-4 text-xs overflow-auto bg-black/40 border border-white/10 p-4 rounded-xl">
{JSON.stringify(content, null, 2)}
      </pre>
    </div>
  );
}
