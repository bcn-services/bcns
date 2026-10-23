/**
 * FileLink.tsx — the one-tap button for a Drive file: a direct download when
 * Drive gave a `web_content_link`, else Open in Drive. Renders nothing for rows
 * that are not Drive files (those use the metered download action).
 */

import { fileLink, fileLinkProps, type MediaLike } from "@/lib/library";

export function FileLink({ row, className = "btn-plain btn-plain--inline", label = "Download" }: { row: MediaLike; className?: string; label?: string }) {
  const link = fileLink(row);
  if (!link) return null;
  return (
    <a className={className} {...fileLinkProps(link)}>
      {link.kind === "download" ? label : "Open in Drive"}
    </a>
  );
}
