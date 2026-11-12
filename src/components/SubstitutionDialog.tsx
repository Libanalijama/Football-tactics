import { useState } from "react";
import { ArrowLeftRight, Check, UserPlus } from "lucide-react";
import type { Player, Scene, TeamSide } from "../types";
import { Modal } from "./Modal";
import "./substitutions.css";
const playerLabel = (p: Player) => p.name || p.role;
export function SubstitutionDialog({
  scene,
  side,
  selectedId,
  onSwap,
  onClose,
  onAdd,
}: {
  scene: Scene;
  side: TeamSide;
  selectedId?: string | null;
  onSwap: (outId: string, inId: string) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
  const initial = scene.players.find((p) => p.id === selectedId);
  const [outId, setOutId] = useState(initial?.onPitch ? initial.id : "");
  const [inId, setInId] = useState(
    initial && !initial.onPitch ? initial.id : "",
  );
  const squad = scene.players.filter((p) => p.team === side);
  const starters = squad.filter((p) => p.onPitch);
  const bench = squad.filter((p) => !p.onPitch);
  const outgoing = starters.find((p) => p.id === outId),
    incoming = bench.find((p) => p.id === inId);
  return (
    <Modal
      title="Make a substitution"
      eyebrow={side === "home" ? "HOME SQUAD" : "AWAY SQUAD"}
      wide
      onClose={onClose}
    >
      <div className="sub-selection">
        <div>
          <span>PLAYER OFF</span>
          <strong>
            {outgoing
              ? `${outgoing.number} · ${playerLabel(outgoing)}`
              : "Choose from the starting XI"}
          </strong>
        </div>
        <ArrowLeftRight size={22} />
        <div>
          <span>PLAYER ON</span>
          <strong>
            {incoming
              ? `${incoming.number} · ${playerLabel(incoming)}`
              : "Choose from the bench"}
          </strong>
        </div>
      </div>
      <div className="sub-squads">
        <div>
          <h3>Starting XI</h3>
          {starters.map((p) => (
            <button
              key={p.id}
              className={`sub-player ${outId === p.id ? "chosen" : ""}`}
              onClick={() => setOutId(p.id)}
              aria-label={`Player off ${p.number} ${p.name}`}
            >
              <span>{p.number || "–"}</span>
              <strong>{playerLabel(p)}</strong>
              <small>{p.role}</small>
              {outId === p.id ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
        <div>
          <h3>Bench</h3>
          {bench.map((p) => (
            <button
              key={p.id}
              className={`sub-player ${inId === p.id ? "chosen" : ""}`}
              onClick={() => setInId(p.id)}
              aria-label={`Player on ${p.number} ${p.name}`}
            >
              <span>{p.number || "–"}</span>
              <strong>{playerLabel(p)}</strong>
              <small>{p.role}</small>
              {inId === p.id ? <Check size={15} /> : null}
            </button>
          ))}
          {!bench.length ? (
            <p className="hint">No substitutes in this squad.</p>
          ) : null}
          <button className="button full small" onClick={onAdd}>
            <UserPlus size={14} /> Add a substitute
          </button>
        </div>
      </div>
      <div className="sub-confirm">
        <span className="hint">
          The incoming player takes the outgoing player’s position. Official
          match data stays unchanged.
        </span>
        <button
          className="button primary"
          disabled={!outgoing || !incoming}
          onClick={() => {
            onSwap(outId, inId);
            onClose();
          }}
        >
          <ArrowLeftRight size={16} /> Make substitution
        </button>
      </div>
    </Modal>
  );
}
