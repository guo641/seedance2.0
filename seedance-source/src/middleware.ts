import { NextResponse, type NextRequest } from 'next/server';

/**
 * 访问闸门:没有验证过秘钥(无 auth_token cookie)时,一律跳转到秘钥验证页 /login。
 * 放行:/login 本身、/api/*(接口各自鉴权)、/share/*(公开分享)、静态资源。
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasKey = !!req.cookies.get('auth_token')?.value;
  if (hasKey) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  // 只拦这些"工作界面"页面;其余(接口/静态/登录/分享)不拦
  matcher: ['/', '/workshop', '/download', '/history', '/speedtest'],
};
