"use client";

import { useId, useMemo, useState } from "react";
import { BASE_SEWO_UI, type BodyZonePickerLabels } from "@/lib/sewo-ui";

type BodyPartOption = {
  id: string;
  name: string;
  code?: string;
};

type BodyZonePickerProps = {
  bodyParts: BodyPartOption[];
  value: string;
  onChange: (value: string) => void;
  labels?: BodyZonePickerLabels;
  required?: boolean;
};

type FigureSide = "front" | "back";

type ZoneConfig = {
  key: string;
  side: FigureSide;
  label: string;
  path: string;
};

type FigureDetail = {
  path: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
  opacity?: number;
};

const VIEWBOX = "0 0 220 410";

// Front-view SVG paths are drawn from the viewer's perspective, so
// anatomical left/right must be mirrored there. Back-view paths already
// match anatomical left/right directly.
const BODY_PART_CODE_TO_ZONE_KEYS: Record<string, string[]> = {
  BP01: ["head-front"],
  BP02: ["right-eye"],
  BP03: ["left-eye"],
  BP04: ["right-shoulder-front", "left-shoulder-back"],
  BP05: ["left-shoulder-front", "right-shoulder-back"],
  BP06: ["right-arm-front", "left-arm-back"],
  BP07: ["left-arm-front", "right-arm-back"],
  BP08: ["right-hand-front", "left-hand-back"],
  BP09: ["left-hand-front", "right-hand-back"],
  BP10: ["chest"],
  BP11: ["upper-back"],
  BP12: ["lower-back"],
  BP13: ["abdomen"],
  BP14: ["right-hip-front", "left-hip-back"],
  BP15: ["left-hip-front", "right-hip-back"],
  BP16: ["right-leg-front", "left-leg-back"],
  BP17: ["left-leg-front", "right-leg-back"],
  BP18: ["right-knee-front", "left-knee-back"],
  BP19: ["left-knee-front", "right-knee-back"],
  BP20: ["right-foot-front", "left-foot-back"],
  BP21: ["left-foot-front", "right-foot-back"],
};

const BODY_PART_CODE_TO_MATCHERS: Record<string, string[]> = {
  BP01: ["head", "forehead", "cabeca", "testa", "glowa", "kopf", "cap", "tete"],
  BP02: ["left eye", "olho esquerdo", "occhio sinistro", "lewe oko", "linkes auge", "ochiul stang", "oeil gauche"],
  BP03: ["right eye", "olho direito", "occhio destro", "prawe oko", "rechtes auge", "ochiul drept", "oeil droit"],
  BP04: ["left shoulder", "ombro esquerdo", "spalla sinistra", "lewe ramie", "linke schulter", "umarul stang", "epaule gauche"],
  BP05: ["right shoulder", "ombro direito", "spalla destra", "prawe ramie", "rechte schulter", "umarul drept", "epaule droite"],
  BP06: ["left arm", "braco esquerdo", "braccio sinistro", "lewe przedramie", "linker arm", "bratul stang", "bras gauche"],
  BP07: ["right arm", "braco direito", "braccio destro", "prawe przedramie", "rechter arm", "bratul drept", "bras droit"],
  BP08: ["left hand", "mao esquerda", "mano sinistra", "lewa dlon", "linke hand", "mana stanga", "main gauche"],
  BP09: ["right hand", "mao direita", "mano destra", "prawa dlon", "rechte hand", "mana dreapta", "main droite"],
  BP10: ["chest", "torax", "torace", "klatka piersiowa", "brustkorb", "thorax"],
  BP11: ["upper back", "costas superiores", "schiena alta", "gorna czesc plecow", "oberer rucken", "partea superioara a spatelui", "haut du dos"],
  BP12: ["lower back", "costas inferiores", "schiena bassa", "dolna czesc plecow", "unterer rucken", "partea inferioara a spatelui", "bas du dos"],
  BP13: ["abdomen", "addome", "brzuch", "bauch"],
  BP14: ["left hip", "anca esquerda", "anca sinistra", "lewe biodro", "linke hufte", "soldul stang", "hanche gauche"],
  BP15: ["right hip", "anca direita", "anca destra", "prawe biodro", "rechte hufte", "soldul drept", "hanche droite"],
  BP16: ["left leg", "perna esquerda", "gamba sinistra", "lewa noga", "linkes bein", "piciorul stang", "jambe gauche"],
  BP17: ["right leg", "perna direita", "gamba destra", "prawa noga", "rechtes bein", "piciorul drept", "jambe droite"],
  BP18: ["left knee", "joelho esquerdo", "ginocchio sinistro", "lewe kolano", "linkes knie", "genunchiul stang", "genou gauche"],
  BP19: ["right knee", "joelho direito", "ginocchio destro", "prawe kolano", "rechtes knie", "genunchiul drept", "genou droit"],
  BP20: ["left foot", "pe esquerdo", "piede sinistro", "lewa stopa", "linker fuss", "laba piciorului stang", "pied gauche"],
  BP21: ["right foot", "pe direito", "piede destro", "prawa stopa", "rechter fuss", "laba piciorului drept", "pied droit"],
};

const CUSTOM_NAME_TO_ZONE_KEYS: Record<string, string[]> = {
  back: ["upper-back", "lower-back"],
  costas: ["upper-back", "lower-back"],
  schiena: ["upper-back", "lower-back"],
  dos: ["upper-back", "lower-back"],
  rucken: ["upper-back", "lower-back"],
};

const ZONES: ZoneConfig[] = [
  { key: "head-front", side: "front", label: "Head", path: "M91 25 C96 18 103 15 110 15 C117 15 124 18 129 25 C135 33 137 43 134 54 C131 66 123 75 110 79 C97 75 89 66 86 54 C83 43 85 33 91 25 Z" },
  { key: "left-eye", side: "front", label: "Left Eye", path: "M95 44 C99 40 105 40 109 44 C105 48 99 48 95 44 Z" },
  { key: "right-eye", side: "front", label: "Right Eye", path: "M111 44 C115 40 121 40 125 44 C121 48 115 48 111 44 Z" },
  { key: "left-shoulder-front", side: "front", label: "Left Shoulder", path: "M72 88 C63 92 58 101 57 113 C66 119 78 119 88 112 L91 94 C85 89 78 86 72 88 Z" },
  { key: "right-shoulder-front", side: "front", label: "Right Shoulder", path: "M148 88 C157 92 162 101 163 113 C154 119 142 119 132 112 L129 94 C135 89 142 86 148 88 Z" },
  { key: "left-shoulder-back", side: "back", label: "Left Shoulder", path: "M72 88 C63 92 58 101 57 113 C66 119 78 119 88 112 L91 94 C85 89 78 86 72 88 Z" },
  { key: "right-shoulder-back", side: "back", label: "Right Shoulder", path: "M148 88 C157 92 162 101 163 113 C154 119 142 119 132 112 L129 94 C135 89 142 86 148 88 Z" },
  { key: "left-arm-front", side: "front", label: "Left Arm", path: "M68 101 C59 112 55 128 56 150 C57 172 62 194 70 207 C74 213 81 214 85 209 C88 205 88 198 86 191 L82 155 L84 119 C84 109 78 101 68 101 Z" },
  { key: "right-arm-front", side: "front", label: "Right Arm", path: "M152 101 C161 112 165 128 164 150 C163 172 158 194 150 207 C146 213 139 214 135 209 C132 205 132 198 134 191 L138 155 L136 119 C136 109 142 101 152 101 Z" },
  { key: "left-arm-back", side: "back", label: "Left Arm", path: "M68 101 C58 112 54 129 55 151 C56 174 61 196 70 210 C74 216 81 217 85 212 C89 208 89 201 87 194 L83 155 L85 118 C85 108 78 101 68 101 Z" },
  { key: "right-arm-back", side: "back", label: "Right Arm", path: "M152 101 C162 112 166 129 165 151 C164 174 159 196 150 210 C146 216 139 217 135 212 C131 208 131 201 133 194 L137 155 L135 118 C135 108 142 101 152 101 Z" },
  { key: "left-hand-front", side: "front", label: "Left Hand", path: "M61 204 C54 206 49 211 47 219 C44 229 47 238 54 242 C61 246 69 242 72 234 C75 226 72 215 68 209 C66 206 64 205 61 204 Z" },
  { key: "right-hand-front", side: "front", label: "Right Hand", path: "M159 204 C166 206 171 211 173 219 C176 229 173 238 166 242 C159 246 151 242 148 234 C145 226 148 215 152 209 C154 206 156 205 159 204 Z" },
  { key: "left-hand-back", side: "back", label: "Left Hand", path: "M60 207 C53 209 49 215 48 223 C47 233 51 241 58 244 C64 247 71 242 73 235 C76 227 72 216 68 211 C66 209 63 207 60 207 Z" },
  { key: "right-hand-back", side: "back", label: "Right Hand", path: "M160 207 C167 209 171 215 172 223 C173 233 169 241 162 244 C156 247 149 242 147 235 C144 227 148 216 152 211 C154 209 157 207 160 207 Z" },
  { key: "chest", side: "front", label: "Chest", path: "M89 94 C95 87 103 83 110 83 C117 83 125 87 131 94 C135 106 136 119 134 133 C127 140 119 143 110 143 C101 143 93 140 86 133 C84 119 85 106 89 94 Z" },
  { key: "abdomen", side: "front", label: "Abdomen", path: "M86 134 C93 140 101 144 110 144 C119 144 127 140 134 134 C134 155 132 175 128 191 C122 198 116 201 110 201 C104 201 98 198 92 191 C88 175 86 155 86 134 Z" },
  { key: "upper-back", side: "back", label: "Upper Back", path: "M86 93 C93 87 101 83 110 83 C119 83 127 87 134 93 C137 106 138 120 136 134 C128 141 119 145 110 145 C101 145 92 141 84 134 C82 120 83 106 86 93 Z" },
  { key: "lower-back", side: "back", label: "Lower Back", path: "M84 135 C92 141 101 145 110 145 C119 145 128 141 136 135 C136 158 134 178 130 197 C124 204 117 207 110 207 C103 207 96 204 90 197 C86 178 84 158 84 135 Z" },
  { key: "left-hip-front", side: "front", label: "Left Hip", path: "M91 191 C84 196 80 204 79 215 L79 233 C87 236 96 234 103 229 L103 203 C99 201 95 197 91 191 Z" },
  { key: "right-hip-front", side: "front", label: "Right Hip", path: "M129 191 C136 196 140 204 141 215 L141 233 C133 236 124 234 117 229 L117 203 C121 201 125 197 129 191 Z" },
  { key: "left-hip-back", side: "back", label: "Left Hip", path: "M90 197 C83 202 79 211 78 222 L79 240 C87 243 97 240 104 234 L103 207 C98 205 94 202 90 197 Z" },
  { key: "right-hip-back", side: "back", label: "Right Hip", path: "M130 197 C137 202 141 211 142 222 L141 240 C133 243 123 240 116 234 L117 207 C122 205 126 202 130 197 Z" },
  { key: "left-leg-front", side: "front", label: "Left Leg", path: "M92 214 C84 219 81 229 80 246 L79 307 C79 322 85 331 94 331 C102 331 107 323 107 309 L108 248 C108 231 102 218 94 214 Z" },
  { key: "right-leg-front", side: "front", label: "Right Leg", path: "M128 214 C136 219 139 229 140 246 L141 307 C141 322 135 331 126 331 C118 331 113 323 113 309 L112 248 C112 231 118 218 126 214 Z" },
  { key: "left-leg-back", side: "back", label: "Left Leg", path: "M91 221 C84 226 81 236 80 252 L79 313 C79 328 85 337 94 337 C102 337 107 329 107 315 L108 254 C108 238 102 225 94 221 Z" },
  { key: "right-leg-back", side: "back", label: "Right Leg", path: "M129 221 C136 226 139 236 140 252 L141 313 C141 328 135 337 126 337 C118 337 113 329 113 315 L112 254 C112 238 118 225 126 221 Z" },
  { key: "left-knee-front", side: "front", label: "Left Knee", path: "M82 281 C88 276 98 276 104 281 C105 289 104 296 100 302 C95 306 88 305 84 301 C81 295 80 288 82 281 Z" },
  { key: "right-knee-front", side: "front", label: "Right Knee", path: "M116 281 C122 276 132 276 138 281 C140 288 139 295 136 301 C132 305 125 306 120 302 C116 296 115 289 116 281 Z" },
  { key: "left-knee-back", side: "back", label: "Left Knee", path: "M82 287 C88 282 98 282 104 287 C105 295 104 302 100 308 C95 312 88 311 84 307 C81 301 80 294 82 287 Z" },
  { key: "right-knee-back", side: "back", label: "Right Knee", path: "M116 287 C122 282 132 282 138 287 C140 294 139 301 136 307 C132 311 125 312 120 308 C116 302 115 295 116 287 Z" },
  { key: "left-foot-front", side: "front", label: "Left Foot", path: "M78 337 C71 340 66 346 66 353 C66 362 73 366 84 366 L99 366 C106 366 111 362 111 355 C111 347 104 340 96 337 Z" },
  { key: "right-foot-front", side: "front", label: "Right Foot", path: "M124 337 C116 340 109 347 109 355 C109 362 114 366 121 366 L136 366 C147 366 154 362 154 353 C154 346 149 340 142 337 Z" },
  { key: "left-foot-back", side: "back", label: "Left Foot", path: "M77 344 C70 347 65 353 65 361 C65 369 72 373 83 373 L98 373 C106 373 111 369 111 362 C111 354 104 347 96 344 Z" },
  { key: "right-foot-back", side: "back", label: "Right Foot", path: "M124 344 C116 347 109 354 109 362 C109 369 114 373 122 373 L137 373 C148 373 155 369 155 361 C155 353 150 347 143 344 Z" },
];

const ZONE_BY_KEY = new Map(ZONES.map((zone) => [zone.key, zone]));

const FIGURE_BASES: Record<FigureSide, string[]> = {
  front: [
    "M110 14 C93 14 80 27 80 44 C80 61 93 74 110 74 C127 74 140 61 140 44 C140 27 127 14 110 14 Z",
    "M100 71 C100 79 104 86 110 86 C116 86 120 79 120 71 Z",
    "M78 89 C87 80 98 76 110 76 C122 76 133 80 142 89 C149 96 153 106 154 118 L157 169 C158 184 149 198 135 206 C127 211 119 214 110 214 C101 214 93 211 85 206 C71 198 62 184 63 169 L66 118 C67 106 71 96 78 89 Z",
    "M72 95 C60 104 54 120 54 145 C54 168 58 188 66 205 C70 213 78 217 84 213 C89 209 91 201 89 192 L84 157 L86 118 C86 105 81 97 72 95 Z",
    "M148 95 C160 104 166 120 166 145 C166 168 162 188 154 205 C150 213 142 217 136 213 C131 209 129 201 131 192 L136 157 L134 118 C134 105 139 97 148 95 Z",
    "M60 202 C52 205 46 211 43 220 C40 229 42 238 48 243 C54 248 63 246 69 241 C75 236 77 227 74 219 C72 211 67 205 60 202 Z",
    "M160 202 C168 205 174 211 177 220 C180 229 178 238 172 243 C166 248 157 246 151 241 C145 236 143 227 146 219 C148 211 153 205 160 202 Z",
    "M88 203 C82 208 79 214 78 222 L76 279 C76 293 81 302 90 304 C99 306 106 299 107 288 L109 243 L109 221 C109 211 97 202 88 203 Z",
    "M132 203 C138 208 141 214 142 222 L144 279 C144 293 139 302 130 304 C121 306 114 299 113 288 L111 243 L111 221 C111 211 123 202 132 203 Z",
    "M76 330 C69 334 65 341 65 349 C65 357 72 362 82 362 L97 362 C104 362 109 358 109 351 C109 343 104 336 97 332 Z",
    "M123 332 C116 336 111 343 111 351 C111 358 116 362 123 362 L138 362 C148 362 155 357 155 349 C155 341 151 334 144 330 Z",
  ],
  back: [
    "M110 14 C93 14 80 27 80 44 C80 61 93 74 110 74 C127 74 140 61 140 44 C140 27 127 14 110 14 Z",
    "M100 71 C100 79 104 86 110 86 C116 86 120 79 120 71 Z",
    "M77 88 C86 80 98 76 110 76 C122 76 134 80 143 88 C150 95 154 105 155 118 L158 173 C159 189 150 202 136 210 C128 214 119 217 110 217 C101 217 92 214 84 210 C70 202 61 189 62 173 L65 118 C66 105 70 95 77 88 Z",
    "M71 94 C59 103 53 120 53 146 C53 170 57 190 65 208 C69 216 77 220 83 216 C88 212 90 204 88 195 L83 154 L85 115 C85 103 80 95 71 94 Z",
    "M149 94 C161 103 167 120 167 146 C167 170 163 190 155 208 C151 216 143 220 137 216 C132 212 130 204 132 195 L137 154 L135 115 C135 103 140 95 149 94 Z",
    "M58 204 C50 208 46 215 46 224 C46 233 50 241 56 245 C62 249 69 247 73 242 C77 237 78 228 75 220 C73 212 66 206 58 204 Z",
    "M162 204 C170 208 174 215 174 224 C174 233 170 241 164 245 C158 249 151 247 147 242 C143 237 142 228 145 220 C147 212 154 206 162 204 Z",
    "M87 209 C81 214 78 220 77 229 L76 284 C76 298 81 307 90 309 C99 311 106 304 107 293 L109 247 L109 227 C109 217 97 208 87 209 Z",
    "M133 209 C139 214 142 220 143 229 L144 284 C144 298 139 307 130 309 C121 311 114 304 113 293 L111 247 L111 227 C111 217 123 208 133 209 Z",
    "M75 336 C68 340 64 347 64 355 C64 363 71 368 81 368 L96 368 C104 368 109 364 109 357 C109 349 104 342 97 338 Z",
    "M123 338 C116 342 111 349 111 357 C111 364 116 368 124 368 L139 368 C149 368 156 363 156 355 C156 347 152 340 145 336 Z",
  ],
};

const FIGURE_DETAILS: Record<FigureSide, FigureDetail[]> = {
  front: [
    { path: "M110 77 L110 212", stroke: "#cbd5e1", strokeWidth: 1.2 },
    { path: "M89 105 C96 111 103 114 110 114 C117 114 124 111 131 105", stroke: "#cbd5e1", strokeWidth: 1.2, fill: "none" },
    { path: "M91 145 C97 151 103 154 110 154 C117 154 123 151 129 145", stroke: "#cbd5e1", strokeWidth: 1.2, fill: "none" },
    { path: "M95 86 C100 91 105 94 110 94 C115 94 120 91 125 86", stroke: "#dbe3ee", strokeWidth: 1.1, fill: "none", opacity: 0.9 },
  ],
  back: [
    { path: "M110 77 L110 216", stroke: "#cbd5e1", strokeWidth: 1.2 },
    { path: "M87 109 C95 103 102 100 110 100 C118 100 125 103 133 109", stroke: "#cbd5e1", strokeWidth: 1.2, fill: "none" },
    { path: "M92 150 C98 146 104 144 110 144 C116 144 122 146 128 150", stroke: "#cbd5e1", strokeWidth: 1.2, fill: "none" },
    { path: "M91 121 C97 126 103 129 110 129 C117 129 123 126 129 121", stroke: "#dbe3ee", strokeWidth: 1.05, fill: "none", opacity: 0.85 },
  ],
};

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getZoneKeysForPart(part: BodyPartOption) {
  if (part.code && BODY_PART_CODE_TO_ZONE_KEYS[part.code]) {
    return BODY_PART_CODE_TO_ZONE_KEYS[part.code];
  }

  const normalized = normalizeName(part.name);
  if (CUSTOM_NAME_TO_ZONE_KEYS[normalized]) {
    return CUSTOM_NAME_TO_ZONE_KEYS[normalized];
  }

  const matchedCode = Object.entries(BODY_PART_CODE_TO_MATCHERS).find(([, matchers]) => matchers.includes(normalized))?.[0];
  return matchedCode ? BODY_PART_CODE_TO_ZONE_KEYS[matchedCode] ?? [] : [];
}

function getZonesForPart(part: BodyPartOption) {
  return getZoneKeysForPart(part)
    .map((key) => ZONE_BY_KEY.get(key))
    .filter((zone): zone is ZoneConfig => Boolean(zone));
}

function findZone(part: BodyPartOption, side: FigureSide) {
  return getZonesForPart(part).find((zone) => zone.side === side) ?? null;
}

function describeViews(part: BodyPartOption, labels: BodyZonePickerLabels) {
  const zones = getZonesForPart(part);
  const hasFront = zones.some((zone) => zone.side === "front");
  const hasBack = zones.some((zone) => zone.side === "back");

  if (hasFront && hasBack) return labels.frontAndBackViews;
  if (hasFront) return labels.frontViewOnly;
  if (hasBack) return labels.backViewOnly;
  return labels.notMapped;
}

function formatLabel(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );
}

function BodyFigure({
  side,
  title,
  labels,
  gradientPrefix,
  selectedPart,
  activePart,
  hoveredPartId,
  zoneAssignments,
  onHoverPart,
  onSelectPart,
}: {
  side: FigureSide;
  title: string;
  labels: BodyZonePickerLabels;
  gradientPrefix: string;
  selectedPart: BodyPartOption | null;
  activePart: BodyPartOption | null;
  hoveredPartId: string | null;
  zoneAssignments: Map<string, BodyPartOption>;
  onHoverPart: (partId: string | null) => void;
  onSelectPart: (partId: string) => void;
}) {
  const displayPart = activePart ?? selectedPart;
  const visibleZone = displayPart ? findZone(displayPart, side) : null;
  const hasMappedArea = displayPart ? getZonesForPart(displayPart).length > 0 : false;
  const bodyFillId = `${gradientPrefix}-${side}-fill`;
  const bodyShadeId = `${gradientPrefix}-${side}-shade`;

  let statusLabel: string = labels.moveOverModel;
  if (visibleZone) {
    statusLabel = displayPart?.name ?? visibleZone.label;
  } else if (displayPart && hasMappedArea) {
    statusLabel = labels.notShownOnView;
  } else if (displayPart) {
    statusLabel = labels.noMappedArea;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className="text-[11px] text-slate-500">{statusLabel}</span>
      </div>

      <div className="mx-auto max-w-[220px]">
        <svg
          viewBox={VIEWBOX}
          className="h-auto w-full"
          aria-label={`${title} anatomical model`}
          onMouseLeave={() => onHoverPart(null)}
        >
          <defs>
            <linearGradient id={bodyFillId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#d9e2ec" />
            </linearGradient>
            <linearGradient id={bodyShadeId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.18" />
            </linearGradient>
          </defs>

          <g>
            {FIGURE_BASES[side].map((path, index) => (
              <path key={`${side}-base-${index}`} d={path} fill={`url(#${bodyFillId})`} stroke="#94a3b8" strokeWidth="1.15" />
            ))}
            {FIGURE_BASES[side].slice(0, 3).map((path, index) => (
              <path key={`${side}-shade-${index}`} d={path} fill={`url(#${bodyShadeId})`} opacity="0.42" />
            ))}
            {FIGURE_DETAILS[side].map((detail, index) => (
              <path
                key={`${side}-detail-${index}`}
                d={detail.path}
                stroke={detail.stroke}
                strokeWidth={detail.strokeWidth}
                fill={detail.fill ?? "none"}
                opacity={detail.opacity ?? 1}
                strokeLinecap="round"
              />
            ))}
          </g>

          <g>
            {ZONES.filter((zone) => zone.side === side).map((zone) => {
              const part = zoneAssignments.get(zone.key) ?? null;
              const isSelected = Boolean(part && selectedPart?.id === part.id);
              const isHovered = Boolean(part && hoveredPartId === part.id);
              const isInteractive = Boolean(part);

              let fill = "#f8fafc";
              let stroke = "#cbd5e1";
              let opacity = 0.7;

              if (isSelected) {
                fill = "#14b8a6";
                stroke = "#0f766e";
                opacity = 0.88;
              }

              if (isHovered) {
                fill = isSelected ? "#0d9488" : "#f59e0b";
                stroke = isSelected ? "#115e59" : "#b45309";
                opacity = 0.92;
              }

              return (
                <path
                  key={zone.key}
                  d={zone.path}
                  role={isInteractive ? "button" : undefined}
                  tabIndex={isInteractive ? 0 : undefined}
                  aria-label={part ? `${part.name} on ${title}` : undefined}
                  aria-pressed={part ? selectedPart?.id === part.id : undefined}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isHovered || isSelected ? 1.7 : 1.25}
                  opacity={opacity}
                  className={isInteractive ? "cursor-pointer" : undefined}
                  style={{ transition: "fill 160ms ease, stroke 160ms ease, opacity 160ms ease" }}
                  onMouseEnter={() => {
                    if (part) onHoverPart(part.id);
                  }}
                  onFocus={() => {
                    if (part) onHoverPart(part.id);
                  }}
                  onBlur={() => onHoverPart(null)}
                  onClick={() => {
                    if (part) onSelectPart(part.id);
                  }}
                  onKeyDown={(event) => {
                    if (!part) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectPart(part.id);
                    }
                  }}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

export function BodyZonePicker({ bodyParts, value, onChange, labels, required = true }: BodyZonePickerProps) {
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const gradientPrefix = useId().replace(/:/g, "");
  const text = labels ?? BASE_SEWO_UI.bodyZonePicker;

  const zoneAssignments = useMemo(() => {
    const assignments = new Map<string, BodyPartOption>();

    for (const part of bodyParts) {
      for (const zone of getZonesForPart(part)) {
        assignments.set(zone.key, part);
      }
    }

    return assignments;
  }, [bodyParts]);

  const selectedPart = bodyParts.find((part) => part.id === value) ?? null;
  const hoveredPart = bodyParts.find((part) => part.id === hoveredPartId) ?? null;
  const activePart = hoveredPart ?? selectedPart;

  const helperText = (() => {
    if (hoveredPart) {
      const viewText = describeViews(hoveredPart, text);
      return viewText === text.notMapped
        ? formatLabel(text.previewUnmapped, { name: hoveredPart.name })
        : formatLabel(text.previewMapped, { name: hoveredPart.name, views: viewText });
    }

    if (selectedPart) {
      const viewText = describeViews(selectedPart, text);
      return viewText === text.notMapped
        ? formatLabel(text.selectedUnmapped, { name: selectedPart.name })
        : formatLabel(text.selectedMapped, { name: selectedPart.name, views: viewText });
    }

    return text.helperDefault;
  })();

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          required={required}
        >
          <option value="">{text.selectPlaceholder}</option>
          {bodyParts.map((bodyPart) => (
            <option key={bodyPart.id} value={bodyPart.id}>
              {bodyPart.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">{helperText}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <BodyFigure
          side="front"
          title={text.frontView}
          labels={text}
          gradientPrefix={gradientPrefix}
          selectedPart={selectedPart}
          activePart={activePart}
          hoveredPartId={hoveredPartId}
          zoneAssignments={zoneAssignments}
          onHoverPart={setHoveredPartId}
          onSelectPart={onChange}
        />
        <BodyFigure
          side="back"
          title={text.backView}
          labels={text}
          gradientPrefix={gradientPrefix}
          selectedPart={selectedPart}
          activePart={activePart}
          hoveredPartId={hoveredPartId}
          zoneAssignments={zoneAssignments}
          onHoverPart={setHoveredPartId}
          onSelectPart={onChange}
        />
      </div>
    </div>
  );
}
