import { useEffect, useState } from "react";
import { useApp } from "../state/store";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/ui";
import { useT } from "../i18n";
import { pendingRequestCount } from "../services/social";
import { pendingChallengeCount } from "../services/challenges";

/** The Connect tab: three doors, Friends, Crews and Challenges. */
export function Connect() {
  const { push, session } = useApp();
  const t = useT();
  const me = session?.user.id ?? null;
  const [pending, setPending] = useState(0);
  const [invites, setInvites] = useState(0);

  useEffect(() => {
    if (!me) return;
    let live = true;
    pendingRequestCount(me)
      .then((n) => live && setPending(n))
      .catch(() => {});
    pendingChallengeCount(me)
      .then((n) => live && setInvites(n))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [me]);

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="pagetitle">{t("tabs.friends")}</div>

        <button className="door" onClick={() => push({ name: "friends" })}>
          <span className="door__icon">
            <Icon name="user" size={26} strokeWidth={2.1} />
          </span>
          <span className="door__main">
            <span className="door__title">Friends</span>
          </span>
          {pending > 0 && <span className="badge">{pending} waiting</span>}
          <Icon name="forward" size={18} />
        </button>

        <button
          className="door"
          onClick={() => push({ name: "crews" })}
        >
          <span className="door__icon door__icon--emoji">🏁</span>
          <span className="door__main">
            <span className="door__title">Crews</span>
          </span>
          <Icon name="forward" size={18} />
        </button>

        <button
          className="door"
          onClick={() => push({ name: "challenges" })}
        >
          <span className="door__icon door__icon--emoji">🏆</span>
          <span className="door__main">
            <span className="door__title">Challenges</span>
          </span>
          {invites > 0 && (
            <span className="badge">
              {invites} invite{invites === 1 ? "" : "s"}
            </span>
          )}
          <Icon name="forward" size={18} />
        </button>
      </div>
    </>
  );
}
