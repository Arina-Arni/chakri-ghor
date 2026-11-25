import { CircleCheck } from "lucide-react";
import { t } from "@/i18n";

/** Animation classes; the keyframes live in app/globals.css ("Login/signup scene"). */
const s = {
  panel: "auth-panel",
  walker: "auth-walker",
  legFront: "auth-leg-front",
  legBack: "auth-leg-back",
  armSwing: "auth-arm-swing",
  bob: "auth-bob",
  bow: "auth-bow",
  caseDrop: "auth-case-drop",
  wave: "auth-wave",
  bubble: "auth-bubble",
  breathe: "auth-breathe",
  blink: "auth-blink",
  sweep: "auth-sweep",
  pulse: "auth-pulse",
  pulseLate: "auth-pulse-late",
  ping: "auth-ping",
} as const;

/** The form side of the auth card slides in with the scene. */
export const authFormIn = "auth-form-in";

const SKIN = "#c68a5e";
const SKIN_DARK = "#a8714b";
const SHIRT = "#f8fafc";
const SHIRT_SHADE = "#e2e8f0";
const TROUSERS = "#334155";
const TROUSERS_FAR = "#273449";
const SHOE = "#0f172a";
const HAIR = "#111827";
const CASE = "#b45309";
const CASE_DARK = "#92400e";

/** Radar blips: position from the radar centre and when each one pings. */
const BLIPS: [number, number, number][] = [
  [-112, -48, 0],
  [98, -82, 0.8],
  [-74, 72, 1.6],
  [120, 36, 2.2],
];

function Leg({ x, color, className }: { x: number; color: string; className: string }) {
  return (
    <g transform={`translate(${x} -92)`}>
      <g className={className}>
        <rect x={-7} y={-6} width={14} height={92} rx={7} fill={color} />
        <path d="M-8 80h17a9 9 0 0 1 9 9v3h-26z" fill={SHOE} />
      </g>
    </g>
  );
}

/** Upper-body wrapper: hip joint, then the bow, the walking bob and idle breathing. */
function Upper({ children }: { children: React.ReactNode }) {
  return (
    <g transform="translate(0 -92)">
      <g className={s.bow}>
        <g className={s.bob}>
          <g className={s.breathe}>{children}</g>
        </g>
      </g>
    </g>
  );
}

/**
 * Decorative panel beside the login/signup forms: a job seeker walks in under the radar with a
 * briefcase, puts it down, waves and points at the form. On large screens it also lists what the
 * site does. Motion stops for people who prefer reduced motion (final pose shown).
 */
export function AuthScene() {
  return (
    <div className={`${s.panel} relative overflow-hidden text-white lg:flex lg:flex-col`}>
      <div className="hidden px-10 pt-10 lg:block">
        <p className="text-2xl font-bold leading-snug">{t("auth.sceneTitle")}</p>
        <ul className="mt-5 space-y-3 text-white/90">
          {[t("auth.scenePoint1"), t("auth.scenePoint2"), t("auth.scenePoint3")].map((text) => (
            <li key={text} className="flex items-start gap-2.5">
              <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-amber-300" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="h-44 sm:h-52 lg:h-auto lg:min-h-72 lg:flex-1">
        <svg viewBox="0 0 360 300" preserveAspectRatio="xMidYMax meet" className="h-full w-full" aria-hidden focusable="false">
          {/* radar */}
          <g transform="translate(180 150)" fill="none" stroke="white">
            <circle r={60} strokeOpacity={0.14} />
            <circle r={105} strokeOpacity={0.12} />
            <circle r={150} strokeOpacity={0.09} />
            <path d="M-150 0H150M0 -150V150" strokeOpacity={0.06} />
            <g className={s.sweep}>
              <path d="M0 0L150 0A150 150 0 0 0 96.4 -114.9Z" fill="white" fillOpacity={0.08} stroke="none" />
              <path d="M0 0H150" strokeOpacity={0.35} strokeWidth={1.5} />
            </g>
            <circle r={20} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" className={s.pulse} />
            <circle r={20} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" className={s.pulseLate} />
            {BLIPS.map(([x, y, delay]) => (
              <g key={`${x},${y}`} transform={`translate(${x} ${y})`} stroke="none">
                <circle r={3.5} fill="#fbbf24" />
                <circle r={3.5} fill="#fbbf24" className={s.ping} style={{ animationDelay: `${delay}s` }} />
              </g>
            ))}
          </g>

          {/* floor */}
          <ellipse cx={180} cy={264} rx={120} ry={10} fill="white" fillOpacity={0.07} />

          {/* the job seeker, feet at (180, 262) */}
          <g transform="translate(180 262)">
            <g className={s.walker}>
              <ellipse cx={4} cy={2} rx={30} ry={5} fill="black" fillOpacity={0.25} />

              {/* far arm: carries the briefcase, so it doesn't swing */}
              <Upper>
                <g transform="translate(-4 -56)">
                  <rect x={-5.5} y={-4} width={11} height={55} rx={5.5} fill={SHIRT_SHADE} />
                  <circle cy={53} r={5.5} fill={SKIN_DARK} />
                </g>
              </Upper>

              {/* briefcase: hangs at that hand, then is put down behind the feet */}
              <g transform="translate(-4 -91)">
                <g className={s.caseDrop}>
                  <g className={s.bob}>
                    <path d="M-7 4v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" fill="none" stroke={CASE_DARK} strokeWidth={3} />
                    <rect x={-20} y={3} width={40} height={27} rx={5} fill={CASE} />
                    <rect x={-20} y={12} width={40} height={3} fill={CASE_DARK} />
                    <rect x={-3} y={10} width={6} height={7} rx={1.5} fill="#fcd34d" />
                  </g>
                </g>
              </g>

              <Leg x={-3} color={TROUSERS_FAR} className={s.legBack} />
              <Leg x={4} color={TROUSERS} className={s.legFront} />

              {/* body, head and the near arm (swings, then waves and points at the form) */}
              <Upper>
                <rect x={-17} y={-62} width={34} height={68} rx={13} fill={SHIRT} />
                <rect x={9} y={-56} width={8} height={54} rx={4} fill={SHIRT_SHADE} />
                <rect x={-17} y={-6} width={34} height={14} rx={6} fill={TROUSERS} />
                <rect x={-17} y={-8} width={34} height={4} rx={1} fill="#1e293b" />
                <rect x={-4.5} y={-71} width={9} height={11} rx={3} fill={SKIN_DARK} />
                <path d="M-7 -62L0 -54L7 -62" fill="none" stroke={SHIRT_SHADE} strokeWidth={2.5} strokeLinejoin="round" />
                <path d="M0 -55l-3.5 5l2.5 24l1 3l1-3l2.5-24z" fill="#f59e0b" />

                <circle cx={2} cy={-88} r={18} fill={SKIN} />
                <path d="M-16 -86A18 18 0 0 1 20 -92Q12 -98 3 -97Q-5 -96 -8 -88Q-10 -82 -15 -80Z" fill={HAIR} />
                <circle cx={-5} cy={-86} r={3.6} fill={SKIN_DARK} />
                <g transform="translate(11 -89)">
                  <g className={s.blink}>
                    <ellipse rx={2} ry={2.5} fill="#0f172a" />
                  </g>
                </g>
                <path d="M8 -95.5q3-2 6.5 0" fill="none" stroke={HAIR} strokeWidth={1.6} strokeLinecap="round" />
                <path d="M19.5 -88.5q2.6 2.6-0.3 5" fill="none" stroke={SKIN_DARK} strokeWidth={1.6} strokeLinecap="round" />
                <path d="M9.5 -79.5q4.2 3.4 8.6-0.6" fill="none" stroke="#7c2d12" strokeWidth={1.7} strokeLinecap="round" />

                <g transform="translate(4 -56)">
                  <g className={s.armSwing}>
                    <g className={s.wave}>
                      <rect x={-6} y={-4} width={12} height={55} rx={6} fill={SHIRT} stroke={SHIRT_SHADE} />
                      <rect x={-6} y={40} width={12} height={5} fill={SHIRT_SHADE} />
                      <circle cy={53} r={6} fill={SKIN} />
                    </g>
                  </g>
                </g>
              </Upper>

              {/* "welcome" bubble above the head */}
              <g transform="translate(26 -205)">
                <g className={s.bubble}>
                  <path d="M2 0L8 -12H20Z" fill="white" />
                  <rect y={-44} width={92} height={33} rx={14} fill="white" />
                  <text x={46} y={-27.5} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={700} fill="#0f766e">
                    {t("auth.sceneWelcome")}
                  </text>
                </g>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
