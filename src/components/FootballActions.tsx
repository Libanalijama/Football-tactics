import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  CircleDot,
  Expand,
  Minimize2,
  Route,
  Shield,
} from "lucide-react";
import type { Scene, TacticalState, TeamSide } from "../types";
import { FORMATIONS } from "../lib/formations";
import {
  advanceTeam,
  applyTacticalPreset,
  attackDirection,
  carryBall,
  changeTeamWidth,
  dropBack,
  passBall,
  placeBall,
  runPlayer,
  setBallCarrier,
  shiftTeam,
  tacticsForScene,
  teamMeasures,
} from "../lib/football-actions";
import type { TacticalPreset } from "../lib/football-actions";
import "./football-actions.css";

export interface FootballActionsProps {
  scene: Scene;
  side: TeamSide;
  selectedPlayerId?: string | null;
  onChange: (scene: Scene) => void;
  onTimeChange?: (time: number) => void;
  onPlay?: () => void;
}

export function FootballActions({
  scene,
  side,
  selectedPlayerId,
  onChange,
  onTimeChange,
  onPlay,
}: FootballActionsProps) {
  const [formation, setFormation] = useState(
    scene.tactics?.formation ?? "4-4-2",
  );
  const [duration, setDuration] = useState(3),
    [metres, setMetres] = useState(10),
    [feedback, setFeedback] = useState("");
  useEffect(() => {
    setFormation(scene.tactics?.formation ?? "4-4-2");
    setFeedback("");
  }, [scene.id, side, scene.tactics?.formation]);
  const selected = scene.players.find(
      (p) => p.id === selectedPlayerId && p.onPitch,
    ),
    tactics = tacticsForScene(scene, side);
  const count = scene.players.filter(
      (p) => p.onPitch && p.team === side,
    ).length,
    measure = teamMeasures(scene.players, side);
  function perform(action: () => Scene, label: string, play = true) {
    try {
      const next = action();
      onChange(next);
      if (play) {
        onTimeChange?.(0);
        onPlay?.();
      }
      setFeedback(label);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "This movement could not be prepared.",
      );
    }
  }
  function toggle(
    key: keyof Pick<
      TacticalState,
      "showShape" | "showLines" | "showDistances" | "showTrails" | "showBall"
    >,
    checked: boolean,
  ) {
    onChange({ ...scene, tactics: { ...tactics, [key]: checked } });
  }
  const moveSelected = (withBall: boolean) => {
    if (!selected) return;
    const destination = {
      x: selected.x + ((attackDirection(selected.team) * metres) / 105) * 100,
      y: selected.y,
    };
    perform(
      () =>
        withBall
          ? carryBall(scene, selected.id, destination, duration)
          : runPlayer(scene, selected.id, destination, duration),
      withBall ? "Ball-carrying run ready." : "Forward run ready.",
    );
  };
  if (scene.background !== "pitch")
    return (
      <section className="football-actions">
        <div className="football-section-title">
          <Shield size={15} />
          <h3>Football movements</h3>
        </div>
        <p className="football-help">
          Choose Tactical board for team shapes and movements. Use the drawing
          tools to analyse your footage.
        </p>
      </section>
    );
  return (
    <section className="football-actions">
      <div className="football-section-title">
        <Shield size={15} />
        <h3>Football movements</h3>
        <span>{side.toUpperCase()}</span>
      </div>
      <p className="football-help">
        Prepare a shape or movement. Start and finish positions are captured
        automatically.
      </p>
      <div className="football-field-pair">
        <label>
          Shape
          <select
            aria-label="Football preset formation"
            value={formation}
            onChange={(e) => setFormation(e.target.value)}
          >
            {FORMATIONS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Movement
          <select
            aria-label="Movement duration"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {[2, 3, 4, 6].map((value) => (
              <option key={value} value={value}>
                {value} seconds
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="football-presets">
        {(
          [
            {
              id: "low",
              label: "Low block",
              detail: "Compact & narrow",
              icon: ChevronsDown,
            },
            {
              id: "mid",
              label: "Mid block",
              detail: "Protect the middle",
              icon: Shield,
            },
            {
              id: "high",
              label: "High press",
              detail: "Step up together",
              icon: ChevronsUp,
            },
            {
              id: "build-out",
              label: "Build out",
              detail: "Spread & support",
              icon: Route,
            },
          ] as const
        ).map(({ id, label, detail, icon: Icon }) => (
          <button
            key={id}
            className={tactics.block === id ? "chosen" : ""}
            disabled={!count}
            aria-label={label}
            onClick={() =>
              perform(
                () =>
                  applyTacticalPreset(
                    scene,
                    side,
                    id as TacticalPreset,
                    formation,
                    duration,
                  ),
                `${label} ready in ${formation}.`,
              )
            }
          >
            <Icon size={17} />
            <strong>{label}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </div>
      <div className="football-unit-metrics">
        <span>Target unit</span>
        <strong>{measure.width.toFixed(1)} m wide</strong>
        <strong>{measure.depth.toFixed(1)} m deep</strong>
      </div>
      <div className="football-section-title football-rule">
        <h3>Move the unit</h3>
        <label className="football-metres">
          <input
            aria-label="Movement distance in metres"
            type="number"
            min="1"
            max="25"
            value={metres}
            onChange={(e) =>
              setMetres(Math.min(25, Math.max(1, Number(e.target.value) || 1)))
            }
          />{" "}
          m
        </label>
      </div>
      <div className="football-move-grid">
        <button
          disabled={!count}
          onClick={() =>
            perform(
              () => dropBack(scene, side, metres, duration),
              `Drop back ${metres} metres ready.`,
            )
          }
        >
          <ArrowDown size={14} /> Drop back
        </button>
        <button
          disabled={!count}
          onClick={() =>
            perform(
              () => advanceTeam(scene, side, metres, duration),
              `Advance ${metres} metres ready.`,
            )
          }
        >
          <ArrowUp size={14} /> Advance
        </button>
        <button
          disabled={!count}
          onClick={() =>
            perform(
              () => shiftTeam(scene, side, "left", metres, duration),
              "Shift left ready.",
            )
          }
        >
          <ArrowLeft size={14} /> Shift left
        </button>
        <button
          disabled={!count}
          onClick={() =>
            perform(
              () => shiftTeam(scene, side, "right", metres, duration),
              "Shift right ready.",
            )
          }
        >
          <ArrowRight size={14} /> Shift right
        </button>
        <button
          disabled={count < 3}
          onClick={() =>
            perform(
              () => changeTeamWidth(scene, side, -5, duration),
              "Team narrows by five metres.",
            )
          }
        >
          <Minimize2 size={14} /> Narrow 5 m
        </button>
        <button
          disabled={count < 3}
          onClick={() =>
            perform(
              () => changeTeamWidth(scene, side, 5, duration),
              "Team widens by five metres.",
            )
          }
        >
          <Expand size={14} /> Widen 5 m
        </button>
      </div>
      <p className="football-micro-hint">
        Left and right follow the team's attacking direction.
      </p>
      <div className="football-section-title football-rule">
        <CircleDot size={15} />
        <h3>Player & ball</h3>
      </div>
      {selected ? (
        <>
          <div className="football-selected">
            <span>{selected.number || "–"}</span>
            <strong>{selected.name || "Selected player"}</strong>
            <small>{selected.team.toUpperCase()}</small>
          </div>
          <div className="football-player-buttons">
            <button
              aria-label="Give ball to selected player"
              onClick={() =>
                perform(
                  () => setBallCarrier(scene, selected.id),
                  "Ball attached to selected player.",
                  false,
                )
              }
            >
              <CircleDot size={14} /> Give player the ball
            </button>
            <button
              aria-label="Carry ball forward"
              className="football-primary"
              onClick={() => moveSelected(true)}
            >
              <Route size={14} /> Carry ball {metres} m
            </button>
            <button
              aria-label="Run selected player forward"
              onClick={() => moveSelected(false)}
            >
              <ArrowRight size={14} /> Run forward {metres} m
            </button>
            <button
              aria-label="Pass ball to selected player"
              disabled={scene.tactics?.ball.carrierId === selected.id}
              onClick={() =>
                perform(
                  () => passBall(scene, selected.id, Math.min(duration, 3)),
                  "Pass to selected player ready.",
                )
              }
            >
              <ArrowRight size={14} /> Pass ball here
            </button>
          </div>
        </>
      ) : (
        <p className="football-help football-player-prompt">
          Select a player on the pitch to carry the ball, make a run or receive
          a pass.
        </p>
      )}
      <button
        className="football-center-ball"
        onClick={() =>
          perform(
            () => placeBall(scene, { x: 50, y: 50 }),
            "Ball placed at the centre spot.",
            false,
          )
        }
      >
        Place ball at centre spot
      </button>
      <div className="football-section-title football-rule">
        <h3>Analysis graphics</h3>
      </div>
      <div className="football-overlays">
        {(
          [
            ["showShape", "Team shape"],
            ["showLines", "Defensive lines"],
            ["showDistances", "Distances"],
            ["showTrails", "Running trails"],
            ["showBall", "Football"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="checkbox"
              aria-label={label}
              checked={tactics[key]}
              onChange={(e) => toggle(key, e.target.checked)}
            />
          </label>
        ))}
      </div>
      <p className="football-micro-hint">
        Pitch measurements use 105 × 68 metres. Footage guides are uncalibrated.
      </p>
      {feedback && (
        <p className="football-feedback" aria-live="polite">
          {feedback}
        </p>
      )}
    </section>
  );
}
