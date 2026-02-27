import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// MikroTik RouterOS API communication
class RouterOSAPI {
  private host: string;
  private port: number;
  private username: string;
  private password: string;

  constructor(host: string, port: number, username: string, password: string) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
  }

  private encodeLength(len: number): Uint8Array {
    if (len < 0x80) return new Uint8Array([len]);
    if (len < 0x4000) return new Uint8Array([((len >> 8) & 0x3f) | 0x80, len & 0xff]);
    if (len < 0x200000) return new Uint8Array([((len >> 16) & 0x1f) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
    if (len < 0x10000000) return new Uint8Array([((len >> 24) & 0x0f) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    return new Uint8Array([0xf0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }

  private encodeWord(word: string): Uint8Array {
    const encoded = new TextEncoder().encode(word);
    const length = this.encodeLength(encoded.length);
    const result = new Uint8Array(length.length + encoded.length);
    result.set(length);
    result.set(encoded, length.length);
    return result;
  }

  private async readLength(reader: ReadableStreamDefaultReader<Uint8Array>, buffer: number[]): Promise<{ length: number; buffer: number[] }> {
    while (buffer.length === 0) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Connection closed");
      buffer.push(...value);
    }

    let len = buffer.shift()!;
    if ((len & 0x80) === 0) return { length: len, buffer };

    const ensureBytes = async (needed: number) => {
      while (buffer.length < needed) {
        const { value, done } = await reader.read();
        if (done) throw new Error("Connection closed");
        buffer.push(...value);
      }
    };

    if ((len & 0xc0) === 0x80) {
      await ensureBytes(1);
      len = ((len & 0x3f) << 8) | buffer.shift()!;
    } else if ((len & 0xe0) === 0xc0) {
      await ensureBytes(2);
      len = ((len & 0x1f) << 16) | (buffer.shift()! << 8) | buffer.shift()!;
    } else if ((len & 0xf0) === 0xe0) {
      await ensureBytes(3);
      len = ((len & 0x0f) << 24) | (buffer.shift()! << 16) | (buffer.shift()! << 8) | buffer.shift()!;
    } else {
      await ensureBytes(4);
      len = (buffer.shift()! << 24) | (buffer.shift()! << 16) | (buffer.shift()! << 8) | buffer.shift()!;
    }
    return { length: len, buffer };
  }

  private async readWord(reader: ReadableStreamDefaultReader<Uint8Array>, buffer: number[]): Promise<{ word: string; buffer: number[] }> {
    const { length, buffer: buf1 } = await this.readLength(reader, buffer);
    buffer = buf1;
    if (length === 0) return { word: "", buffer };

    while (buffer.length < length) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Connection closed");
      buffer.push(...value);
    }

    const wordBytes = new Uint8Array(buffer.splice(0, length));
    return { word: new TextDecoder().decode(wordBytes), buffer };
  }

  private async readSentence(reader: ReadableStreamDefaultReader<Uint8Array>, buffer: number[]): Promise<{ words: string[]; buffer: number[] }> {
    const words: string[] = [];
    while (true) {
      const { word, buffer: buf } = await this.readWord(reader, buffer);
      buffer = buf;
      if (word === "") break;
      words.push(word);
    }
    return { words, buffer };
  }

  private md5Challenge(challenge: Uint8Array, password: string): Uint8Array {
    // Simple MD5 for RouterOS login
    const data = new Uint8Array(1 + password.length + challenge.length);
    data[0] = 0;
    const passBytes = new TextEncoder().encode(password);
    data.set(passBytes, 1);
    data.set(challenge, 1 + passBytes.length);
    return data;
  }

  async execute(commands: string[][]): Promise<Record<string, string>[][]> {
    const conn = await Deno.connect({ hostname: this.host, port: this.port });
    const writer = conn.writable.getWriter();
    const reader = conn.readable.getReader();
    let buffer: number[] = [];

    try {
      // Login
      const loginWords = ["/login", `=name=${this.username}`, `=password=${this.password}`];
      const loginData: Uint8Array[] = loginWords.map(w => this.encodeWord(w));
      loginData.push(new Uint8Array([0])); // end of sentence
      for (const d of loginData) await writer.write(d);

      // Read login response
      const { words: loginResp, buffer: buf1 } = await this.readSentence(reader, buffer);
      buffer = buf1;
      if (loginResp[0] === "!trap") {
        throw new Error("Login failed: " + loginResp.join(" "));
      }
      // Read any trailing sentences
      if (loginResp[0] === "!done") {
        // Check if there's a ret (challenge-based login for older RouterOS)
        const retWord = loginResp.find(w => w.startsWith("=ret="));
        if (retWord) {
          // Older challenge-based auth not implemented - v7 uses plaintext login
        }
      }

      const allResults: Record<string, string>[][] = [];

      for (const cmd of commands) {
        // Send command
        const cmdData: Uint8Array[] = cmd.map(w => this.encodeWord(w));
        cmdData.push(new Uint8Array([0]));
        for (const d of cmdData) await writer.write(d);

        // Read response
        const results: Record<string, string>[] = [];
        while (true) {
          const { words, buffer: buf } = await this.readSentence(reader, buffer);
          buffer = buf;

          if (words.length === 0) continue;
          if (words[0] === "!done") break;
          if (words[0] === "!trap") {
            console.error("Command error:", words.join(" "));
            break;
          }
          if (words[0] === "!re") {
            const record: Record<string, string> = {};
            for (let i = 1; i < words.length; i++) {
              if (words[i].startsWith("=")) {
                const eqIdx = words[i].indexOf("=", 1);
                if (eqIdx > 0) {
                  record[words[i].substring(1, eqIdx)] = words[i].substring(eqIdx + 1);
                }
              }
            }
            results.push(record);
          }
        }
        allResults.push(results);
      }

      // Quit
      await writer.write(this.encodeWord("/quit"));
      await writer.write(new Uint8Array([0]));

      return allResults;
    } finally {
      try { writer.releaseLock(); } catch {}
      try { reader.releaseLock(); } catch {}
      try { conn.close(); } catch {}
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const deviceId = body.device_id;

    // Get devices
    let devices: any[] = [];
    if (deviceId) {
      const { data } = await supabase.from("devices").select("*").eq("id", deviceId);
      devices = data || [];
    } else {
      const { data } = await supabase.from("devices").select("*");
      devices = data || [];
    }

    const results: any[] = [];

    for (const device of devices) {
      try {
        const api = new RouterOSAPI(device.ip_address, device.port, device.username, device.password);

        const [filterRules, natRules, connections] = await api.execute([
          ["/ip/firewall/filter/print", "=.proplist=.id,chain,action,src-address,dst-address,protocol,dst-port,src-port,in-interface,out-interface,comment,disabled,bytes,packets"],
          ["/ip/firewall/nat/print", "=.proplist=.id,chain,action,src-address,dst-address,protocol,dst-port,src-port,to-addresses,to-ports,in-interface,out-interface,comment,disabled,bytes,packets"],
          ["/ip/firewall/connection/print", "=count-only="],
        ]);

        // Clear old data for this device
        await supabase.from("firewall_rules").delete().eq("device_id", device.id);
        await supabase.from("nat_rules").delete().eq("device_id", device.id);

        // Insert firewall filter rules
        if (filterRules.length > 0) {
          const firewallInserts = filterRules.map((r, i) => ({
            device_id: device.id,
            chain: r.chain || "unknown",
            action: r.action || "unknown",
            src_address: r["src-address"] || null,
            dst_address: r["dst-address"] || null,
            protocol: r.protocol || null,
            dst_port: r["dst-port"] || null,
            src_port: r["src-port"] || null,
            in_interface: r["in-interface"] || null,
            out_interface: r["out-interface"] || null,
            comment: r.comment || null,
            disabled: r.disabled === "true",
            bytes: parseInt(r.bytes || "0") || 0,
            packets: parseInt(r.packets || "0") || 0,
            rule_order: i,
            mikrotik_id: r[".id"] || null,
          }));
          await supabase.from("firewall_rules").insert(firewallInserts);
        }

        // Insert NAT rules
        if (natRules.length > 0) {
          const natInserts = natRules.map((r, i) => ({
            device_id: device.id,
            chain: r.chain || "unknown",
            action: r.action || "unknown",
            src_address: r["src-address"] || null,
            dst_address: r["dst-address"] || null,
            protocol: r.protocol || null,
            dst_port: r["dst-port"] || null,
            src_port: r["src-port"] || null,
            to_addresses: r["to-addresses"] || null,
            to_ports: r["to-ports"] || null,
            in_interface: r["in-interface"] || null,
            out_interface: r["out-interface"] || null,
            comment: r.comment || null,
            disabled: r.disabled === "true",
            bytes: parseInt(r.bytes || "0") || 0,
            packets: parseInt(r.packets || "0") || 0,
            rule_order: i,
            mikrotik_id: r[".id"] || null,
          }));
          await supabase.from("nat_rules").insert(natInserts);
        }

        // Parse connection tracking stats
        // For connection count, we run a second command
        let totalConns = 0;
        let tcpConns = 0;
        let udpConns = 0;
        let icmpConns = 0;

        try {
          const [allConns, tcpResults, udpResults, icmpResults] = await new RouterOSAPI(
            device.ip_address, device.port, device.username, device.password
          ).execute([
            ["/ip/firewall/connection/print", "=count-only="],
            ["/ip/firewall/connection/print", "=count-only=", "?protocol=tcp"],
            ["/ip/firewall/connection/print", "=count-only=", "?protocol=udp"],
            ["/ip/firewall/connection/print", "=count-only=", "?protocol=icmp"],
          ]);

          // count-only returns in !done =ret=N
          totalConns = parseInt(allConns[0]?.ret || "0") || 0;
          tcpConns = parseInt(tcpResults[0]?.ret || "0") || 0;
          udpConns = parseInt(udpResults[0]?.ret || "0") || 0;
          icmpConns = parseInt(icmpResults[0]?.ret || "0") || 0;
        } catch (connErr) {
          console.error("Connection tracking error:", connErr);
        }

        await supabase.from("connection_tracking").insert({
          device_id: device.id,
          total_connections: totalConns,
          tcp_connections: tcpConns,
          udp_connections: udpConns,
          icmp_connections: icmpConns,
        });

        // Fetch recent firewall log entries
        try {
          const logApi = new RouterOSAPI(device.ip_address, device.port, device.username, device.password);
          const [logEntries] = await logApi.execute([
            ["/log/print", "?topics~firewall", "=.proplist=time,message"],
          ]);

          if (logEntries.length > 0) {
            const logInserts = logEntries.slice(0, 100).map(entry => {
              // Parse firewall log message
              const msg = entry.message || "";
              const srcMatch = msg.match(/src-mac [^ ]+ src ([^ ]+)/i) || msg.match(/src[= ]([0-9.]+)/i);
              const dstMatch = msg.match(/dst[= ]([0-9.]+)/i);
              const protoMatch = msg.match(/proto[= ]([^ ,]+)/i);
              const dstPortMatch = msg.match(/dst-port[= ]([0-9]+)/i);
              const chainMatch = msg.match(/^([^ ]+)/);
              const actionMatch = msg.match(/action[= ]([^ ,]+)/i);
              const inIfMatch = msg.match(/in[= ]([^ ,]+)/i);
              const outIfMatch = msg.match(/out[= ]([^ ,]+)/i);

              return {
                device_id: device.id,
                chain: chainMatch?.[1] || null,
                action: actionMatch?.[1] || null,
                src_address: srcMatch?.[1] || null,
                dst_address: dstMatch?.[1] || null,
                protocol: protoMatch?.[1] || null,
                dst_port: dstPortMatch?.[1] || null,
                in_interface: inIfMatch?.[1] || null,
                out_interface: outIfMatch?.[1] || null,
                log_message: msg,
              };
            });
            await supabase.from("firewall_logs").insert(logInserts);
          }
        } catch (logErr) {
          console.error("Log fetch error:", logErr);
        }

        results.push({
          device: device.name,
          success: true,
          filter_rules: filterRules.length,
          nat_rules: natRules.length,
          connections: totalConns,
        });
      } catch (deviceErr) {
        console.error(`Error fetching from ${device.name}:`, deviceErr);
        results.push({
          device: device.name,
          success: false,
          error: deviceErr instanceof Error ? deviceErr.message : "Unknown error",
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in fetch-firewall-data:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
