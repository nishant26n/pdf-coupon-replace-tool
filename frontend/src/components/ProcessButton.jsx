export default function ProcessButton({ onClick, disabled, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full py-3 rounded-lg font-medium text-white transition flex items-center justify-center gap-2",
        disabled
          ? "bg-slate-300 cursor-not-allowed"
          : "bg-blue-600 hover:bg-blue-700",
      ].join(" ")}
    >
      {loading && (
        <svg
          className="animate-spin h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {loading ? "Processing..." : "Process & download ZIP"}
    </button>
  );
}
