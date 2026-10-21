import Link from "next/link";

const steps = [
  ["Analyze", "Parse the proposed change and score its risk."],
  ["Research", "Pull external evidence on the failure mechanism."],
  ["Plan", "Nemotron designs a controlled experiment."],
  ["Baseline", "Measure the current config on the real workload."],
  ["Candidate", "Run the proposed config, order-balanced."],
  ["Compare", "Paired rounds with 95% confidence intervals."],
  ["Decide", "Deterministic SAFE / WARN / BLOCK policy."],
  ["Roll out", "Get a canary-ready rollout plan."],
];

const features = [
  ["Measured, not guessed", "Real inference requests against Nebius-hosted NVIDIA Nemotron. TTFT, P50/P95 latency, throughput and error rate."],
  ["Fail-closed by design", "Missing or incomplete evidence never passes. Incomplete runs resolve to BLOCK, not SAFE."],
  ["Paired statistics", "Baseline and candidate alternate order across rounds, so drift can't masquerade as regression."],
  ["A/A noise control", "Prelight tests your config against itself to measure run-to-run noise, so a +6% blip isn't mistaken for a regression."],
  ["Safe boundary explorer", "Scan a range of settings to find the highest value that still certifies SAFE, and see the cliff on a chart."],
  ["Pull-request safety check", "A GitHub Action runs Prelight when configs/change.json changes and comments the verdict on the PR. BLOCK fails the check."],
];

const sweep = [
  ["300", "SAFE", "-10.05%", "-8.14%"],
  ["350", "SAFE", "-3.71%", "-5.99%"],
  ["400", "WARN", "+6.40%", "+10.02%"],
  ["500", "BLOCK", "+23.00%", "+22.79%"],
];

const tone: Record<string, string> = {
  SAFE: "bg-emerald-500/10 text-emerald-300",
  WARN: "bg-amber-500/10 text-amber-300",
  BLOCK: "bg-red-500/10 text-red-300",
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#07090d]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3" aria-label="Prelight home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] font-semibold">P</span>
            <span className="font-semibold tracking-wide">PRELIGHT</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm text-slate-300 sm:gap-3">
            <a href="#how" className="hidden rounded-lg px-3 py-2 hover:text-white sm:block">How it works</a>
            <a href="#features" className="hidden rounded-lg px-3 py-2 hover:text-white sm:block">Features</a>
            <a href="#results" className="hidden rounded-lg px-3 py-2 hover:text-white sm:block">Results</a>
            <Link href="/dashboard" className="rounded-lg bg-white px-4 py-2 font-semibold text-black hover:bg-slate-200">
              Open dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main id="content">
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(118,185,0,0.16),transparent)]" />
          <div className="relative mx-auto max-w-4xl px-5 pb-20 pt-24 text-center">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-[#76b900]" aria-hidden="true" />
              Powered by NVIDIA Nemotron on Nebius
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
              Prove an AI infrastructure change is safe{" "}
              <span className="text-[#76b900]">before it ships.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Monitoring tells you something broke. Prelight tells you whether it will, by
              running a controlled experiment on your real workload and returning an
              evidence-backed SAFE, WARN or BLOCK decision.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard" className="rounded-xl bg-[#76b900] px-6 py-3 font-semibold text-black hover:bg-[#8bd100]">
                Validate a change
              </Link>
              <a href="#how" className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-white hover:bg-white/[0.06]">
                See how it works
              </a>
            </div>
          </div>
        </section>

        <section id="results" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <div className="rounded-3xl border border-white/[0.08] bg-[#0a0d12] p-6 sm:p-10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Real safe-boundary scan</p>
            <h2 className="mt-2 text-2xl font-semibold">How far can max_tokens go from 300?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Each value was tested in five paired rounds against the baseline on Nebius Token
              Factory. Prelight certifies the highest SAFE setting and blocks the one that
              regresses latency by more than 20%.
            </p>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <caption className="sr-only">Latency change versus the 300-token baseline</caption>
                <thead className="text-slate-400">
                  <tr>
                    <th scope="col" className="pb-3 font-medium">max_tokens</th>
                    <th scope="col" className="pb-3 font-medium">Decision</th>
                    <th scope="col" className="pb-3 text-right font-medium">Mean latency</th>
                    <th scope="col" className="pb-3 text-right font-medium">P95 latency</th>
                  </tr>
                </thead>
                <tbody>
                  {sweep.map(([tokens, status, mean, p95]) => (
                    <tr key={tokens} className="border-t border-white/[0.06]">
                      <td className="py-3 tabular-nums">{tokens}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone[status]}`}>{status}</span>
                      </td>
                      <td className="py-3 text-right tabular-nums text-slate-300">{mean}</td>
                      <td className="py-3 text-right tabular-nums text-slate-300">{p95}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">From proposal to proof in eight steps</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(([title, text], i) => (
              <li key={title} className="rounded-2xl border border-white/[0.07] bg-[#0a0d12] p-5">
                <span className="text-xs font-semibold text-[#76b900]">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">Built to be trusted</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(([title, text]) => (
              <article key={title} className="rounded-2xl border border-white/[0.07] bg-[#0a0d12] p-6">
                <h3 className="text-lg font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Stop shipping on hope.</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Open the control plane and see the evidence behind every decision.
          </p>
          <Link href="/dashboard" className="mt-8 inline-block rounded-xl bg-white px-7 py-3 font-semibold text-black hover:bg-slate-200">
            Open dashboard
          </Link>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] py-8 text-center text-sm text-slate-400">
        Prelight · NVIDIA Nemotron · Nebius Token Factory · Tavily
      </footer>
    </div>
  );
}
