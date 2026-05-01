const STYLES = {
  idle: "hidden",
  loading: "bg-blue-50 border-blue-200 text-blue-800",
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
};

export default function StatusBanner({ status, title, message, details }) {
  if (status === "idle") return null;
  return (
    <div
      className={`border rounded-lg p-4 text-sm ${STYLES[status] || STYLES.idle}`}
    >
      <p className="font-medium">{title}</p>
      {message && <p className="mt-1">{message}</p>}
      {details && details.length > 0 && (
        <ul className="mt-2 list-disc list-inside text-xs">
          {details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
