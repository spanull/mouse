import { notFound, redirect } from "next/navigation";
import { CommunityApp } from "@/components/community-app";

/** 解析新版场景及直达详情；旧版入口重定向到对应新场景，不保留评论或回复路由。 */
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const path = "/" + slug.join("/");
  if (path === "/topics/new") redirect("/restaurant/kitchen");
  if (slug[0] === "topics") redirect("/restaurant");
  if (slug[0] === "board") redirect("/bar/wall");
  if (slug[0] === "inbox") redirect("/home/records");
  const valid = ["/", "/restaurant", "/restaurant/menu", "/restaurant/kitchen", "/bar", "/bar/wall", "/bar/drinks", "/home/characters", "/home/records", "/settings", "/admin"].includes(path) ||
    (slug.length === 3 && ((slug[0] === "restaurant" && slug[1] === "dish") || (slug[0] === "bar" && slug[1] === "wall")));
  if (!valid) notFound();
  return <CommunityApp key={path} path={path} />;
}
