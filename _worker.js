import { connect } from "cloudflare:sockets";

export default {
  async fetch(request, env, ctx) {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("proxyip");

    if (!domain) {
      return new Response(JSON.stringify({ error: "Missing ?proxyip=" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 查询 A / AAAA 记录
    const [ipv4Resp, ipv6Resp] = await Promise.all([
      fetch(`https://1.1.1.1/dns-query?name=${domain}&type=A`, {
        headers: { Accept: "application/dns-json" },
      }),
      fetch(`https://1.1.1.1/dns-query?name=${domain}&type=AAAA`, {
        headers: { Accept: "application/dns-json" },
      }),
    ]);

    const [ipv4Data, ipv6Data] = await Promise.all([
      ipv4Resp.json(),
      ipv6Resp.json(),
    ]);

    const ips = [];

    if (ipv4Data?.Answer) {
      for (const a of ipv4Data.Answer) {
        if (a.type === 1) ips.push(a.data); // A记录
      }
    }

    if (ipv6Data?.Answer) {
      for (const a of ipv6Data.Answer) {
        if (a.type === 28) ips.push(a.data); // AAAA记录
      }
    }

    if (ips.length === 0) {
      return new Response(JSON.stringify({ error: "No IPs resolved" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 批量检测每个 IP:port，默认端口为 443
    const results = await Promise.all(
      ips.map(async (ip) => {
        const proxyIP = ip;
        const portRemote = 443;
        const url = `https://${ip}`;
        const now = new Date().toISOString();

        try {
          const res = await fetch(url, {
            method: "GET",
            headers: {
              "Host": domain, // SNI / HTTP Host
              "User-Agent": "Mozilla/5.0 (checkproxy)",
            },
            redirect: "manual",
          });

          const text = await res.text();

          return {
            success: true,
            proxyIP,
            portRemote,
            statusCode: res.status,
            responseSize: text.length,
            responseData: text.slice(0, 512), // 避免过大
            timestamp: now,
          };
        } catch (err) {
          return {
            success: false,
            proxyIP,
            portRemote,
            statusCode: null,
            responseSize: 0,
            responseData: "",
            timestamp: now,
          };
        }
      })
    );

    return new Response(JSON.stringify(results, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
