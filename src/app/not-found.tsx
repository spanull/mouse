import Link from "next/link";

/** 为不支持的路由提供明确返回入口，避免用户停留在没有导航的空页面。 */
export default function NotFound() {
  return <main className="standalone"><h1>这条小路还没通。</h1><p>你可以回到小院，重新找找想去的地方。</p><Link href="/" className="button primary">回到小院</Link></main>;
}
