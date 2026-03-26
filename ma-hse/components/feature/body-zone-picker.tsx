"use client";

type BodyPartOption = {
  id: string;
  name: string;
};

type BodyZonePickerProps = {
  bodyParts: BodyPartOption[];
  value: string;
  onChange: (value: string) => void;
};

type ZoneConfig = {
  body: "front" | "back";
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: "circle" | "pill";
  match: (name: string) => boolean;
};

const ZONES: ZoneConfig[] = [
  { body: "front", x: 50, y: 10, width: 24, height: 24, shape: "circle", match: (name) => name.toLowerCase() === "head" },
  { body: "back", x: 50, y: 10, width: 24, height: 24, shape: "circle", match: (name) => name.toLowerCase() === "head" },
  { body: "front", x: 45, y: 18, width: 7, height: 8, shape: "circle", match: (name) => name.toLowerCase() === "left eye" },
  { body: "front", x: 55, y: 18, width: 7, height: 8, shape: "circle", match: (name) => name.toLowerCase() === "right eye" },
  { body: "front", x: 36, y: 26, width: 14, height: 10, shape: "pill", match: (name) => name.toLowerCase() === "left shoulder" },
  { body: "front", x: 64, y: 26, width: 14, height: 10, shape: "pill", match: (name) => name.toLowerCase() === "right shoulder" },
  { body: "back", x: 36, y: 26, width: 14, height: 10, shape: "pill", match: (name) => name.toLowerCase() === "left shoulder" },
  { body: "back", x: 64, y: 26, width: 14, height: 10, shape: "pill", match: (name) => name.toLowerCase() === "right shoulder" },
  { body: "front", x: 24, y: 42, width: 10, height: 30, shape: "pill", match: (name) => name.toLowerCase() === "left arm" },
  { body: "front", x: 76, y: 42, width: 10, height: 30, shape: "pill", match: (name) => name.toLowerCase() === "right arm" },
  { body: "back", x: 24, y: 42, width: 10, height: 30, shape: "pill", match: (name) => name.toLowerCase() === "left arm" },
  { body: "back", x: 76, y: 42, width: 10, height: 30, shape: "pill", match: (name) => name.toLowerCase() === "right arm" },
  { body: "front", x: 15, y: 61, width: 10, height: 10, shape: "circle", match: (name) => name.toLowerCase() === "left hand" },
  { body: "front", x: 85, y: 61, width: 10, height: 10, shape: "circle", match: (name) => name.toLowerCase() === "right hand" },
  { body: "back", x: 15, y: 61, width: 10, height: 10, shape: "circle", match: (name) => name.toLowerCase() === "left hand" },
  { body: "back", x: 85, y: 61, width: 10, height: 10, shape: "circle", match: (name) => name.toLowerCase() === "right hand" },
  { body: "front", x: 50, y: 36, width: 24, height: 14, shape: "pill", match: (name) => name.toLowerCase() === "chest" },
  { body: "back", x: 50, y: 33, width: 24, height: 12, shape: "pill", match: (name) => name.toLowerCase() === "upper back" },
  { body: "back", x: 50, y: 45, width: 24, height: 12, shape: "pill", match: (name) => name.toLowerCase() === "lower back" },
  { body: "front", x: 50, y: 49, width: 22, height: 13, shape: "pill", match: (name) => name.toLowerCase() === "abdomen" },
  { body: "front", x: 43, y: 60, width: 12, height: 10, shape: "pill", match: (name) => name.toLowerCase() === "left hip" },
  { body: "front", x: 57, y: 60, width: 12, height: 10, shape: "pill", match: (name) => name.toLowerCase() === "right hip" },
  { body: "back", x: 43, y: 60, width: 12, height: 10, shape: "pill", match: (name) => name.toLowerCase() === "left hip" },
  { body: "back", x: 57, y: 60, width: 12, height: 10, shape: "pill", match: (name) => name.toLowerCase() === "right hip" },
  { body: "front", x: 44, y: 78, width: 10, height: 28, shape: "pill", match: (name) => name.toLowerCase() === "left leg" },
  { body: "front", x: 56, y: 78, width: 10, height: 28, shape: "pill", match: (name) => name.toLowerCase() === "right leg" },
  { body: "back", x: 44, y: 78, width: 10, height: 28, shape: "pill", match: (name) => name.toLowerCase() === "left leg" },
  { body: "back", x: 56, y: 78, width: 10, height: 28, shape: "pill", match: (name) => name.toLowerCase() === "right leg" },
  { body: "front", x: 44, y: 89, width: 10, height: 8, shape: "pill", match: (name) => name.toLowerCase() === "left knee" },
  { body: "front", x: 56, y: 89, width: 10, height: 8, shape: "pill", match: (name) => name.toLowerCase() === "right knee" },
  { body: "back", x: 44, y: 89, width: 10, height: 8, shape: "pill", match: (name) => name.toLowerCase() === "left knee" },
  { body: "back", x: 56, y: 89, width: 10, height: 8, shape: "pill", match: (name) => name.toLowerCase() === "right knee" },
  { body: "front", x: 44, y: 100, width: 12, height: 8, shape: "pill", match: (name) => name.toLowerCase() === "left foot" },
  { body: "front", x: 56, y: 100, width: 12, height: 8, shape: "pill", match: (name) => name.toLowerCase() === "right foot" },
  { body: "back", x: 44, y: 100, width: 12, height: 8, shape: "pill", match: (name) => name.toLowerCase() === "left foot" },
  { body: "back", x: 56, y: 100, width: 12, height: 8, shape: "pill", match: (name) => name.toLowerCase() === "right foot" },
];

function Figure({ body, title, bodyParts, selectedId }: {
  body: "front" | "back";
  title: string;
  bodyParts: BodyPartOption[];
  selectedId: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="relative mx-auto h-72 w-40">
        <svg viewBox="0 0 160 280" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id={`body-${body}`} x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#e5e7eb" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>

          <circle cx="80" cy="24" r="17" fill={`url(#body-${body})`} />
          <path
            d="M72 39 C72 34, 88 34, 88 39 L88 49 C102 51, 113 57, 118 71 L123 89 C126 99, 123 108, 115 110 L108 112 L106 146 C105 154, 99 159, 92 159 L68 159 C61 159, 55 154, 54 146 L52 112 L45 110 C37 108, 34 99, 37 89 L42 71 C47 57, 58 51, 72 49 Z"
            fill={`url(#body-${body})`}
          />
          <path d="M47 70 C39 78, 34 96, 36 118 C37 128, 43 135, 49 132 C53 130, 55 123, 55 116 L56 84 C56 76, 53 71, 47 70 Z" fill={`url(#body-${body})`} />
          <path d="M113 70 C121 78, 126 96, 124 118 C123 128, 117 135, 111 132 C107 130, 105 123, 105 116 L104 84 C104 76, 107 71, 113 70 Z" fill={`url(#body-${body})`} />
          <ellipse cx="46" cy="139" rx="7" ry="9" fill={`url(#body-${body})`} />
          <ellipse cx="114" cy="139" rx="7" ry="9" fill={`url(#body-${body})`} />
          <path d="M67 159 C61 166, 58 178, 58 196 L58 230 C58 238, 63 243, 69 243 C75 243, 78 238, 78 230 L78 196 C78 182, 75 169, 67 159 Z" fill={`url(#body-${body})`} />
          <path d="M93 159 C99 166, 102 178, 102 196 L102 230 C102 238, 97 243, 91 243 C85 243, 82 238, 82 230 L82 196 C82 182, 85 169, 93 159 Z" fill={`url(#body-${body})`} />
          <ellipse cx="67" cy="249" rx="11" ry="5" fill={`url(#body-${body})`} />
          <ellipse cx="93" cy="249" rx="11" ry="5" fill={`url(#body-${body})`} />

          {body === "front" ? (
            <>
              <path d="M80 42 L80 152" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M64 56 C70 60, 90 60, 96 56" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M65 90 C71 94, 89 94, 95 90" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M67 122 C72 126, 88 126, 93 122" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M80 50 L80 150" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M66 78 C72 73, 88 73, 94 78" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M66 110 C72 105, 88 105, 94 110" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </>
          )}
        </svg>

        {bodyParts.map((part) => {
          const zone = ZONES.find((item) => item.body === body && item.match(part.name));
          if (!zone) return null;

          const selected = selectedId === part.id;
          if (!selected) return null;

          return (
            <div
              key={`${body}-${part.id}`}
              title={part.name}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
              }}
            >
              <span
                className={`block h-full w-full opacity-80 mix-blend-multiply ${
                  zone.shape === "circle" ? "rounded-full" : "rounded-2xl"
                } bg-teal-500/55`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BodyZonePicker({ bodyParts, value, onChange }: BodyZonePickerProps) {
  const selected = bodyParts.find((part) => part.id === value);
  const displayBody = selected && /back/i.test(selected.name) ? "back" : "front";

  return (
    <div className="space-y-3">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        required
      >
        <option value="">Body part affected</option>
        {bodyParts.map((bodyPart) => (
          <option key={bodyPart.id} value={bodyPart.id}>
            {bodyPart.name}
          </option>
        ))}
      </select>

      <Figure body={displayBody} title={displayBody === "back" ? "Back" : "Front"} bodyParts={bodyParts} selectedId={value} />
      <div className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
        {selected ? `Selected body part: ${selected.name}` : "Choose the affected body part from the list to highlight it on the anatomical model."}
      </div>
    </div>
  );
}
