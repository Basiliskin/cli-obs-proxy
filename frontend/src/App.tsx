import { TokenChart } from "./components/TokenChart";
import { MetricsTable } from "./components/MetricsTable";

function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          CLI LLM Observability
        </h1>
        <p className="text-gray-600">
          Transparent proxy metrics for Claude Code & CLI tools
        </p>
      </header>

      <TokenChart />
      <MetricsTable />
    </div>
  );
}

export default App;
