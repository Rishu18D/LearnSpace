import { useEffect, useRef, useState } from "react";
import { Bell, BookOpen, CheckCheck, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { Empty, Notice, Spinner } from "../components/UI";
import { notificationApi } from "../lib/api";
import "./Notifications.css";

const pageSize = 20;
const filters = [
  ["all", "All"],
  ["unread", "Unread"],
  ["read", "Read"]
];

function PageHeading({ unread, onReadAll, busy }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">STAY IN THE LOOP</span>
        <h1>Notifications<em>.</em></h1>
        <p>Updates to keep your learning journey moving.</p>
      </div>
      <div className="notification-heading-actions">
        <span className="count">{unread} unread</span>
        {unread > 0 && (
          <button className="btn outline" type="button" onClick={onReadAll} disabled={busy}>
            <CheckCheck size={15} /> {busy ? "Updating..." : "Mark all read"}
          </button>
        )}
      </div>
    </div>
  );
}

function formattedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function Notifications() {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ all: 0, unread: 0, read: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestGeneration = useRef(0);

  useEffect(() => {
    let live = true;
    requestGeneration.current += 1;
    async function load() {
      setLoading(true);
      setLoadingMore(false);
      setItems([]);
      setTotal(0);
      setPage(1);
      setPages(1);
      setCounts({ all: 0, unread: 0, read: 0 });
      setError("");
      try {
        const params = { page: 1, limit: pageSize };
        if (filter !== "all") params.status = filter;
        const result = await notificationApi.list(params);
        if (!live) return;
        const notifications = Array.isArray(result.notifications) ? result.notifications : [];
        setItems(notifications);
        setCounts(result.counts || { all: result.pagination?.total || notifications.length, unread: result.unread || 0, read: 0 });
        setTotal(result.pagination?.total ?? notifications.length);
        setPage(1);
        setPages(result.pagination?.pages ?? 1);
      } catch (requestError) {
        if (live) setError(requestError.message);
      } finally {
        if (live) setLoading(false);
      }
    }
    load();
    return () => { live = false; };
  }, [filter, retry]);

  async function loadMore() {
    const generation = requestGeneration.current;
    setLoadingMore(true);
    setError("");
    try {
      const params = { page: page + 1, limit: pageSize };
      if (filter !== "all") params.status = filter;
      const result = await notificationApi.list(params);
      const notifications = Array.isArray(result.notifications) ? result.notifications : [];
      if (generation !== requestGeneration.current) return;
      setItems(current => [...current, ...notifications]);
      setCounts(result.counts || counts);
      setTotal(result.pagination?.total ?? total);
      setPage(result.pagination?.page ?? page + 1);
      setPages(result.pagination?.pages ?? pages);
    } catch (requestError) {
      if (generation === requestGeneration.current) setError(requestError.message);
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false);
    }
  }

  async function markRead(notification) {
    if (notification.readAt || busyId || markingAll) return;
    setBusyId(String(notification._id));
    setError("");
    try {
      const result = await notificationApi.read(notification._id);
      setItems(current => filter === "unread"
        ? current.filter(item => item._id !== notification._id)
        : current.map(item => item._id === notification._id ? result.notification : item));
      setCounts(current => ({
        ...current,
        unread: Math.max(0, current.unread - 1),
        read: current.read + 1
      }));
      if (filter === "unread") setTotal(current => Math.max(0, current - 1));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  async function markAllRead() {
    if (markingAll || busyId || counts.unread === 0) return;
    setMarkingAll(true);
    setError("");
    try {
      await notificationApi.readAll();
      const now = new Date().toISOString();
      setItems(current => filter === "unread" ? [] : current.map(item => item.readAt ? item : { ...item, readAt: now }));
      setCounts(current => ({ ...current, unread: 0, read: current.all }));
      if (filter === "unread") {
        setTotal(0);
        setPages(1);
        setPage(1);
      }
      setRetry(value => value + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Layout>
      <PageHeading unread={counts.unread} onReadAll={markAllRead} busy={markingAll || Boolean(busyId)} />
      <div className="notification-toolbar">
        <div className="tabs notification-tabs" aria-label="Filter notifications">
          {filters.map(([value, label]) => (
            <button
              type="button"
              aria-pressed={filter === value}
              className={filter === value ? "selected" : ""}
              key={value}
              onClick={() => setFilter(value)}
            >
              {label}<small>{counts[value]}</small>
            </button>
          ))}
        </div>
        <button className="btn outline notification-refresh" type="button" onClick={() => setRetry(value => value + 1)} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {error && <><Notice type="error">{error}</Notice><button className="btn outline notification-retry" type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></>}
      {loading ? <Spinner label="Loading notifications..." /> : error && items.length === 0 ? null : items.length === 0 ? (
        <Empty
          title={filter === "unread" ? "You're all caught up" : filter === "read" ? "No read notifications yet" : "All quiet here"}
          text={filter === "unread" ? "There are no unread updates right now." : "Learning updates will appear here."}
          action="Explore courses"
        />
      ) : (
        <>
          <div className="panel notifications">
            {items.map(notification => {
              const date = new Date(notification.createdAt);
              const dateTime = Number.isNaN(date.getTime()) ? undefined : date.toISOString();
              const courseId = notification.data?.courseId;
              return (
                <article key={notification._id} className={notification.readAt ? "read" : "unread"}>
                  <span className="row-icon" aria-hidden="true"><Bell size={18} /></span>
                  <div className="notification-content">
                    <b>{notification.title || "Learning update"}</b>
                    <p>{notification.message || "You have a new update."}</p>
                    <small><time dateTime={dateTime}>{formattedDate(notification.createdAt)}</time></small>
                    {courseId && <Link className="inline-link notification-course-link" to={`/courses/${courseId}`}><BookOpen size={14} /> View course</Link>}
                  </div>
                  {!notification.readAt && (
                    <button
                      className="icon-btn notification-read-button"
                      type="button"
                      disabled={markingAll || Boolean(busyId)}
                      onClick={() => markRead(notification)}
                      aria-label={`Mark ${notification.title || "notification"} as read`}
                      title="Mark as read"
                    >
                      <CheckCheck size={17} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {page < pages && (
            <div className="notification-more">
              <button className="btn outline" type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading..." : `Load more (${Math.max(0, total - items.length)} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
