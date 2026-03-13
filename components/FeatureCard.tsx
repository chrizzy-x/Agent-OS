interface FeatureCardProps {
  icon: string;
  name: string;
  description: string;
  tools: string[];
}

export default function FeatureCard({ icon, name, description, tools }: FeatureCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-6 hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-2 font-mono text-gray-900">{name}</h3>
      <p className="text-gray-600 text-sm mb-4 leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-1.5">
        {tools.map((tool) => (
          <span
            key={tool}
            className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
          >
            {tool}
          </span>
        ))}
      </div>
    </div>
  );
}
