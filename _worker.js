// File: _worker.js (for Cloudflare Pages Functions)

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const domain = url.searchParams.get("proxyip");

  if (!domain) {
    return new Response("Missing 'proxyip' parameter", {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolveDomain = async (domain) => {
    const [ipv4Response, ipv6Response] = await Promise.all([
      fetch(`https://1.1.1.1/dns-query?name=${domain}&type=A`, {
        headers: { Accept: "application/dns-json" },
      }),
      fetch(`https://1.1.1.1/dns-query?name=${domain}&type=AAAA`, {
        headers: { Accept: "application/dns-json" },
      }),
    ]);

    const [ipv4Data, ipv6Data] = await Promise.all([
      ipv4Response.json(),
      ipv6Response.json(),
    ]);

    const ips = [];

    if (ipv4Data.Answer) {
      const ipv4Addresses = ipv4Data.Answer.filter((r) => r.type === 1).map((r) => r.data);
      ips.push(...ipv4Addresses);
    }

    if (ipv6Data.Answer) {
      const ipv6Addresses = ipv6Data.Answer.filter((r) => r.type === 28).map((r) => `[${r.data}]`);
      ips.push(...ipv6Addresses);
    }

    return ips;
  };

  const checkProxyIP = async (ip, domain) => {
    const now = new Date().toISOString();
    const targetURL = `https://${ip}`;

    try {
      const res = await fetch(targetURL, {
        method: "GET",
        headers: {
          Host: domain,
          "User-Agent": "Mozilla/5.0 (checkproxy)",
        },
        redirect: "manual",
      });

      const text = await res.text();
      const success = res.status >= 200 && res.status < 300;

      return {
        success,
        proxyIP: ip,
        portRemote: 443,
        statusCode: res.status,
        responseSize: text.length,
        responseData: text.slice(0, 512),
        timestamp: now,
      };
    } catch (err) {
      return {
        success: false,
        proxyIP: ip,
        portRemote: 443,
        statusCode: null,
        responseSize: 0,
        responseData: "",
        timestamp: now,
      };
    }
  };

  try {
    const ipList = await resolveDomain(domain);
    const results = await Promise.all(ipList.map((ip) => checkProxyIP(ip, domain)));

    return new Response(JSON.stringify(results, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
