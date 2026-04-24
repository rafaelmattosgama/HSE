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

type FigureSide = "front" | "back";

type ZoneConfig = {
  key: string;
  side: FigureSide;
  label: string;
  path: string;
  aliases: string[];
};

const FRONT_SILHOUETTE = {
  head: "M80 18 C67 18 58 28 58 41 C58 52 65 61 73 64 L73 72 C67 74 62 79 60 86 L56 103 C52 117 51 130 57 138 L61 142 L61 169 C61 177 64 184 71 188 L71 209 C71 218 69 228 66 240 L61 266 C59 273 62 278 68 278 C74 278 77 274 78 268 L82 240 C83 232 83 224 83 215 L83 188 L77 188 C84 188 89 188 96 188 L96 215 C96 224 96 232 97 240 L101 268 C102 274 105 278 111 278 C117 278 120 273 118 266 L113 240 C110 228 108 218 108 209 L108 188 C115 184 119 177 119 169 L119 142 L123 138 C129 130 128 117 124 103 L120 86 C118 79 113 74 107 72 L107 64 C115 61 122 52 122 41 C122 28 113 18 80 18 Z",
  torso: "M73 72 L87 72 C103 72 114 79 117 95 L121 113 C123 123 123 132 120 138 L116 145 L115 169 C115 178 108 184 99 184 L61 184 C52 184 45 178 45 169 L44 145 L40 138 C37 132 37 123 39 113 L43 95 C46 79 57 72 73 72 Z",
  leftArm: "M43 92 C34 98 28 110 27 126 C26 141 29 155 37 164 C41 169 48 167 50 160 L54 140 L56 110 C56 98 51 90 43 92 Z",
  rightArm: "M117 92 C126 98 132 110 133 126 C134 141 131 155 123 164 C119 169 112 167 110 160 L106 140 L104 110 C104 98 109 90 117 92 Z",
  leftHand: "M37 164 C31 165 26 170 24 177 C22 184 24 192 29 196 C34 200 40 199 44 195 C49 190 50 183 47 176 C45 170 42 166 37 164 Z",
  rightHand: "M123 164 C129 165 134 170 136 177 C138 184 136 192 131 196 C126 200 120 199 116 195 C111 190 110 183 113 176 C115 170 118 166 123 164 Z",
  leftLeg: "M62 184 L79 184 L78 212 C78 228 76 243 73 259 L70 279 C69 286 63 290 57 287 C52 284 49 278 51 272 L55 248 C58 232 59 218 59 204 L59 191 C59 188 60 186 62 184 Z",
  rightLeg: "M81 184 L98 184 C100 186 101 188 101 191 L101 204 C101 218 102 232 105 248 L109 272 C111 278 108 284 103 287 C97 290 91 286 90 279 L87 259 C84 243 82 228 82 212 L81 184 Z",
  leftFoot: "M54 279 C48 281 44 285 44 290 C44 295 49 298 57 298 L70 298 C75 298 78 295 78 291 C78 286 74 282 69 281 Z",
  rightFoot: "M91 279 C86 282 82 286 82 291 C82 295 85 298 90 298 L103 298 C111 298 116 295 116 290 C116 285 112 281 106 279 Z",
};

const BACK_SILHOUETTE = {
  head: "M80 18 C67 18 58 28 58 41 C58 52 65 61 73 64 L73 72 C67 74 62 79 60 86 L56 103 C52 117 51 130 57 138 L61 142 L61 169 C61 177 64 184 71 188 L71 209 C71 218 69 228 66 240 L61 266 C59 273 62 278 68 278 C74 278 77 274 78 268 L82 240 C83 232 83 224 83 215 L83 188 L77 188 C84 188 89 188 96 188 L96 215 C96 224 96 232 97 240 L101 268 C102 274 105 278 111 278 C117 278 120 273 118 266 L113 240 C110 228 108 218 108 209 L108 188 C115 184 119 177 119 169 L119 142 L123 138 C129 130 128 117 124 103 L120 86 C118 79 113 74 107 72 L107 64 C115 61 122 52 122 41 C122 28 113 18 80 18 Z",
  torso: "M73 72 L87 72 C103 72 114 79 117 95 L121 113 C123 123 123 132 120 138 L116 145 L115 169 C115 178 108 184 99 184 L61 184 C52 184 45 178 45 169 L44 145 L40 138 C37 132 37 123 39 113 L43 95 C46 79 57 72 73 72 Z",
  leftArm: "M43 92 C34 98 28 110 27 126 C26 141 29 155 37 164 C41 169 48 167 50 160 L54 140 L56 110 C56 98 51 90 43 92 Z",
  rightArm: "M117 92 C126 98 132 110 133 126 C134 141 131 155 123 164 C119 169 112 167 110 160 L106 140 L104 110 C104 98 109 90 117 92 Z",
  leftHand: "M37 164 C31 165 26 170 24 177 C22 184 24 192 29 196 C34 200 40 199 44 195 C49 190 50 183 47 176 C45 170 42 166 37 164 Z",
  rightHand: "M123 164 C129 165 134 170 136 177 C138 184 136 192 131 196 C126 200 120 199 116 195 C111 190 110 183 113 176 C115 170 118 166 123 164 Z",
  leftLeg: "M62 184 L79 184 L78 212 C78 228 76 243 73 259 L70 279 C69 286 63 290 57 287 C52 284 49 278 51 272 L55 248 C58 232 59 218 59 204 L59 191 C59 188 60 186 62 184 Z",
  rightLeg: "M81 184 L98 184 C100 186 101 188 101 191 L101 204 C101 218 102 232 105 248 L109 272 C111 278 108 284 103 287 C97 290 91 286 90 279 L87 259 C84 243 82 228 82 212 L81 184 Z",
  leftFoot: "M54 279 C48 281 44 285 44 290 C44 295 49 298 57 298 L70 298 C75 298 78 295 78 291 C78 286 74 282 69 281 Z",
  rightFoot: "M91 279 C86 282 82 286 82 291 C82 295 85 298 90 298 L103 298 C111 298 116 295 116 290 C116 285 112 281 106 279 Z",
};

const ZONES: ZoneConfig[] = [
  { key: "head-front", side: "front", label: "Head", path: "M63 21 C73 15 87 15 97 21 C103 25 107 32 107 40 C107 49 102 57 94 61 C85 66 75 66 66 61 C58 57 53 49 53 40 C53 32 57 25 63 21 Z", aliases: ["head"] },
  { key: "head-back", side: "back", label: "Head", path: "M63 21 C73 15 87 15 97 21 C103 25 107 32 107 40 C107 49 102 57 94 61 C85 66 75 66 66 61 C58 57 53 49 53 40 C53 32 57 25 63 21 Z", aliases: ["head"] },
  { key: "left-eye", side: "front", label: "Left Eye", path: "M65 36 C69 33 73 33 77 36 C73 40 69 40 65 36 Z", aliases: ["left eye"] },
  { key: "right-eye", side: "front", label: "Right Eye", path: "M83 36 C87 33 91 33 95 36 C91 40 87 40 83 36 Z", aliases: ["right eye"] },
  { key: "left-shoulder-front", side: "front", label: "Left Shoulder", path: "M44 81 C50 75 58 73 67 74 L63 92 C56 91 49 92 43 95 C41 90 41 85 44 81 Z", aliases: ["left shoulder"] },
  { key: "right-shoulder-front", side: "front", label: "Right Shoulder", path: "M116 81 C110 75 102 73 93 74 L97 92 C104 91 111 92 117 95 C119 90 119 85 116 81 Z", aliases: ["right shoulder"] },
  { key: "left-shoulder-back", side: "back", label: "Left Shoulder", path: "M44 81 C50 75 58 73 67 74 L64 91 C56 91 49 92 43 95 C41 90 41 85 44 81 Z", aliases: ["left shoulder"] },
  { key: "right-shoulder-back", side: "back", label: "Right Shoulder", path: "M116 81 C110 75 102 73 93 74 L96 91 C104 91 111 92 117 95 C119 90 119 85 116 81 Z", aliases: ["right shoulder"] },
  { key: "left-arm-front", side: "front", label: "Left Arm", path: "M34 99 C40 95 47 97 49 105 L47 138 C45 151 41 160 35 162 C29 154 27 141 28 126 C29 114 31 105 34 99 Z", aliases: ["left arm"] },
  { key: "right-arm-front", side: "front", label: "Right Arm", path: "M126 99 C120 95 113 97 111 105 L113 138 C115 151 119 160 125 162 C131 154 133 141 132 126 C131 114 129 105 126 99 Z", aliases: ["right arm"] },
  { key: "left-arm-back", side: "back", label: "Left Arm", path: "M34 99 C40 95 47 97 49 105 L47 138 C45 151 41 160 35 162 C29 154 27 141 28 126 C29 114 31 105 34 99 Z", aliases: ["left arm"] },
  { key: "right-arm-back", side: "back", label: "Right Arm", path: "M126 99 C120 95 113 97 111 105 L113 138 C115 151 119 160 125 162 C131 154 133 141 132 126 C131 114 129 105 126 99 Z", aliases: ["right arm"] },
  { key: "left-hand-front", side: "front", label: "Left Hand", path: "M27 173 C30 168 35 166 40 168 C45 170 48 175 48 181 C48 188 44 194 38 196 C32 198 26 195 24 189 C22 183 23 177 27 173 Z", aliases: ["left hand"] },
  { key: "right-hand-front", side: "front", label: "Right Hand", path: "M133 173 C130 168 125 166 120 168 C115 170 112 175 112 181 C112 188 116 194 122 196 C128 198 134 195 136 189 C138 183 137 177 133 173 Z", aliases: ["right hand"] },
  { key: "left-hand-back", side: "back", label: "Left Hand", path: "M27 173 C30 168 35 166 40 168 C45 170 48 175 48 181 C48 188 44 194 38 196 C32 198 26 195 24 189 C22 183 23 177 27 173 Z", aliases: ["left hand"] },
  { key: "right-hand-back", side: "back", label: "Right Hand", path: "M133 173 C130 168 125 166 120 168 C115 170 112 175 112 181 C112 188 116 194 122 196 C128 198 134 195 136 189 C138 183 137 177 133 173 Z", aliases: ["right hand"] },
  { key: "chest", side: "front", label: "Chest", path: "M57 86 C64 81 74 79 80 79 C86 79 96 81 103 86 L99 116 C93 121 87 123 80 123 C73 123 67 121 61 116 Z", aliases: ["chest"] },
  { key: "abdomen", side: "front", label: "Abdomen", path: "M61 118 C68 122 74 124 80 124 C86 124 92 122 99 118 L98 152 C92 158 86 161 80 161 C74 161 68 158 62 152 Z", aliases: ["abdomen"] },
  { key: "upper-back", side: "back", label: "Upper Back", path: "M57 83 C64 78 74 76 80 76 C86 76 96 78 103 83 L100 113 C93 118 87 120 80 120 C73 120 67 118 60 113 Z", aliases: ["upper back"] },
  { key: "lower-back", side: "back", label: "Lower Back", path: "M60 114 C67 118 73 120 80 120 C87 120 93 118 100 114 L98 154 C92 159 87 162 80 162 C73 162 68 159 62 154 Z", aliases: ["lower back"] },
  { key: "left-hip-front", side: "front", label: "Left Hip", path: "M61 153 C66 157 71 160 76 161 L76 184 L62 184 C58 179 57 171 57 164 C57 159 58 156 61 153 Z", aliases: ["left hip"] },
  { key: "right-hip-front", side: "front", label: "Right Hip", path: "M99 153 C94 157 89 160 84 161 L84 184 L98 184 C102 179 103 171 103 164 C103 159 102 156 99 153 Z", aliases: ["right hip"] },
  { key: "left-hip-back", side: "back", label: "Left Hip", path: "M61 153 C66 157 71 160 76 161 L76 184 L62 184 C58 179 57 171 57 164 C57 159 58 156 61 153 Z", aliases: ["left hip"] },
  { key: "right-hip-back", side: "back", label: "Right Hip", path: "M99 153 C94 157 89 160 84 161 L84 184 L98 184 C102 179 103 171 103 164 C103 159 102 156 99 153 Z", aliases: ["right hip"] },
  { key: "left-leg-front", side: "front", label: "Left Leg", path: "M60 184 L79 184 L78 212 C78 224 77 235 75 247 L72 268 C71 275 67 279 61 280 C56 281 52 278 52 272 L56 244 C59 228 60 214 60 200 Z", aliases: ["left leg"] },
  { key: "right-leg-front", side: "front", label: "Right Leg", path: "M81 184 L100 184 L100 200 C100 214 101 228 104 244 L108 272 C108 278 104 281 99 280 C93 279 89 275 88 268 L85 247 C83 235 82 224 82 212 Z", aliases: ["right leg"] },
  { key: "left-leg-back", side: "back", label: "Left Leg", path: "M60 184 L79 184 L78 212 C78 224 77 235 75 247 L72 268 C71 275 67 279 61 280 C56 281 52 278 52 272 L56 244 C59 228 60 214 60 200 Z", aliases: ["left leg"] },
  { key: "right-leg-back", side: "back", label: "Right Leg", path: "M81 184 L100 184 L100 200 C100 214 101 228 104 244 L108 272 C108 278 104 281 99 280 C93 279 89 275 88 268 L85 247 C83 235 82 224 82 212 Z", aliases: ["right leg"] },
  { key: "left-knee-front", side: "front", label: "Left Knee", path: "M58 225 C63 221 71 221 76 225 C77 231 77 237 75 242 C70 246 64 246 59 242 C57 237 57 231 58 225 Z", aliases: ["left knee"] },
  { key: "right-knee-front", side: "front", label: "Right Knee", path: "M84 225 C89 221 97 221 102 225 C103 231 103 237 101 242 C96 246 90 246 85 242 C83 237 83 231 84 225 Z", aliases: ["right knee"] },
  { key: "left-knee-back", side: "back", label: "Left Knee", path: "M58 225 C63 221 71 221 76 225 C77 231 77 237 75 242 C70 246 64 246 59 242 C57 237 57 231 58 225 Z", aliases: ["left knee"] },
  { key: "right-knee-back", side: "back", label: "Right Knee", path: "M84 225 C89 221 97 221 102 225 C103 231 103 237 101 242 C96 246 90 246 85 242 C83 237 83 231 84 225 Z", aliases: ["right knee"] },
  { key: "left-foot-front", side: "front", label: "Left Foot", path: "M49 281 C56 278 67 278 73 281 C77 283 79 287 79 291 C79 295 76 298 70 298 L57 298 C48 298 43 295 43 290 C43 286 45 283 49 281 Z", aliases: ["left foot"] },
  { key: "right-foot-front", side: "front", label: "Right Foot", path: "M87 281 C93 278 104 278 111 281 C115 283 117 286 117 290 C117 295 112 298 103 298 L90 298 C84 298 81 295 81 291 C81 287 83 283 87 281 Z", aliases: ["right foot"] },
  { key: "left-foot-back", side: "back", label: "Left Foot", path: "M49 281 C56 278 67 278 73 281 C77 283 79 287 79 291 C79 295 76 298 70 298 L57 298 C48 298 43 295 43 290 C43 286 45 283 49 281 Z", aliases: ["left foot"] },
  { key: "right-foot-back", side: "back", label: "Right Foot", path: "M87 281 C93 278 104 278 111 281 C115 283 117 286 117 290 C117 295 112 298 103 298 L90 298 C84 298 81 295 81 291 C81 287 83 283 87 281 Z", aliases: ["right foot"] },
];

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function findZone(partName: string, side: FigureSide) {
  const normalized = normalizeName(partName);
  return ZONES.find((zone) => zone.side === side && zone.aliases.some((alias) => alias === normalized)) ?? null;
}

function BodyFigure({
  side,
  title,
  selectedPart,
}: {
  side: FigureSide;
  title: string;
  selectedPart: BodyPartOption | undefined;
}) {
  const selectedZone = selectedPart ? findZone(selectedPart.name, side) : null;
  const silhouette = side === "front" ? FRONT_SILHOUETTE : BACK_SILHOUETTE;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className="text-[11px] text-slate-400">{selectedZone ? selectedZone.label : "No zone selected"}</span>
      </div>

      <div className="mx-auto max-w-[180px]">
        <svg viewBox="0 0 160 310" className="h-auto w-full" aria-hidden="true">
          <defs>
            <linearGradient id={`body-fill-${side}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
            <linearGradient id={`body-shadow-${side}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.18" />
            </linearGradient>
          </defs>

          <g>
            <path d={silhouette.head} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.4" />
            <path d={silhouette.torso} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.4" />
            <path d={silhouette.leftArm} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.2" />
            <path d={silhouette.rightArm} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.2" />
            <path d={silhouette.leftHand} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.1" />
            <path d={silhouette.rightHand} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.1" />
            <path d={silhouette.leftLeg} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.2" />
            <path d={silhouette.rightLeg} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.2" />
            <path d={silhouette.leftFoot} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.1" />
            <path d={silhouette.rightFoot} fill={`url(#body-fill-${side})`} stroke="#94a3b8" strokeWidth="1.1" />

            <path d={silhouette.head} fill={`url(#body-shadow-${side})`} opacity="0.45" />
            <path d={silhouette.torso} fill={`url(#body-shadow-${side})`} opacity="0.45" />

            {side === "front" ? (
              <>
                <path d="M80 71 L80 184" stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M64 97 C69 101 75 103 80 103 C85 103 91 101 96 97" stroke="#cbd5e1" strokeWidth="1.2" fill="none" />
                <path d="M66 126 C70 129 75 131 80 131 C85 131 90 129 94 126" stroke="#cbd5e1" strokeWidth="1.2" fill="none" />
              </>
            ) : (
              <>
                <path d="M80 72 L80 183" stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M60 100 C67 96 74 94 80 94 C86 94 93 96 100 100" stroke="#cbd5e1" strokeWidth="1.2" fill="none" />
                <path d="M63 132 C69 129 74 128 80 128 C86 128 91 129 97 132" stroke="#cbd5e1" strokeWidth="1.2" fill="none" />
              </>
            )}
          </g>

          {selectedZone ? (
            <g>
              <path d={selectedZone.path} fill="#14b8a6" opacity="0.78" stroke="#0f766e" strokeWidth="1.5" />
              <path d={selectedZone.path} fill="#ffffff" opacity="0.12" />
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

export function BodyZonePicker({ bodyParts, value, onChange }: BodyZonePickerProps) {
  const selectedPart = bodyParts.find((part) => part.id === value);
  const selectedZoneFront = selectedPart ? findZone(selectedPart.name, "front") : null;
  const selectedZoneBack = selectedPart ? findZone(selectedPart.name, "back") : null;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
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
        <p className="text-xs text-slate-500">
          {selectedPart
            ? `Highlighted area: ${selectedPart.name}${selectedZoneFront && selectedZoneBack ? " on both front and back views" : ""}.`
            : "Choose the affected body zone to highlight the anatomical model."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <BodyFigure side="front" title="Front" selectedPart={selectedZoneFront ? selectedPart : undefined} />
        <BodyFigure side="back" title="Back" selectedPart={selectedZoneBack ? selectedPart : undefined} />
      </div>
    </div>
  );
}
