import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    if ((len & 0xc0) === 0x80) { await ensureBytes(1); len = ((len & 0x3f) << 8) | buffer.shift()!; }
    else if ((len & 0xe0) === 0xc0) { await ensureBytes(2); len = ((len & 0x1f) << 16) | (buffer.shift()! << 8) | buffer.shift()!; }
    else if ((len & 0xf0) === 0xe0) { await ensureBytes(3); len = ((len & 0x0f) << 24) | (buffer.shift()! << 16) | (buffer.shift()! << 8) | buffer.shift()!; }
    else { await ensureBytes(4); len = (buffer.shift()! << 24) | (buffer.shift()! << 16) | (buffer.shift()! << 8) | buffer.shift()!; }
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

  async execute(commands: string[][]): Promise<Record<string, string>[][]> {
    const conn = await Deno.connect({ hostname: this.host, port: this.port });
    const writer = conn.writable.getWriter();
    const reader = conn.readable.getReader();
    let buffer: number[] = [];

    try {
      const loginWords = ["/login", `=name=${this.username}`, `=password=${this.password}`];
      const loginData: Uint8Array[] = loginWords.map(w => this.encodeWord(w));
      loginData.push(new Uint8Array([0]));
      for (const d of loginData) await writer.write(d);

      const { words: loginResp, buffer: buf1 } = await this.readSentence(reader, buffer);
      buffer = buf1;
      if (loginResp[0] === "!trap") throw new Error("Login failed: " + loginResp.join(" "));

      const allResults: Record<string, string>[][] = [];

      for (const cmd of commands) {
        const cmdData: Uint8Array[] = cmd.map(w => this.encodeWord(w));
        cmdData.push(new Uint8Array([0]));
        for (const d of cmdData) await writer.write(d);

        const results: Record<string, string>[] = [];
        while (true) {
          const { words, buffer: buf } = await this.readSentence(reader, buffer);
          buffer = buf;
          if (words.length === 0) continue;
          if (words[0] === "!done") break;
          if (words[0] === "!trap") { console.error("Command error:", words.join(" ")); break; }
          if (words[0] === "!re") {
            const record: Record<string, string> = {};
            for (let i = 1; i < words.length; i++) {
              if (words[i].startsWith("=")) {
                const eqIdx = words[i].indexOf("=", 1);
                if (eqIdx > 0) record[words[i].substring(1, eqIdx)] = words[i].substring(eqIdx + 1);
              }
            }
            results.push(record);
          }
        }
        allResults.push(results);
      }

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

    let devices: any[] = [];
    if (deviceId) {
      const { data } = await supabase.from("devices").select("id, name, ip_address, port, username").eq("id", deviceId);
      devices = data || [];
    } else {
      const { data } = await supabase.from("devices").select("id, name, ip_address, port, username");
      devices = data || [];
    }

    const results: any[] = [];

    for (const device of devices) {
      try {
        // Decrypt password from DB
        const { data: pwData } = await supabase.rpc("decrypt_device_password", { p_device_id: device.id });
        const decryptedPassword = pwData as string;
        const api = new RouterOSAPI(device.ip_address, device.port, device.username, decryptedPassword);

        const [pppoeActive, dhcpLeases, arpEntries] = await api.execute([
          ["/ppp/active/print", "=.proplist=.id,name,service,caller-id,address,uptime,encoding"],
          ["/ip/dhcp-server/lease/print", "=.proplist=.id,address,mac-address,host-name,server,status,expires-after,last-seen"],
          ["/ip/arp/print", "=.proplist=.id,address,mac-address,interface,dynamic,complete"],
        ]);

        // Clear old data for this device
        await supabase.from("pppoe_sessions").delete().eq("device_id", device.id);
        await supabase.from("dhcp_leases").delete().eq("device_id", device.id);
        await supabase.from("arp_entries").delete().eq("device_id", device.id);

        // Insert PPPoE sessions
        if (pppoeActive.length > 0) {
          const pppoeInserts = pppoeActive.map(r => ({
            device_id: device.id,
            username: r.name || "unknown",
            service: r.service || null,
            caller_id: r["caller-id"] || null,
            address: r.address || null,
            uptime: r.uptime || null,
            encoding: r.encoding || null,
            session_id: null,
            mikrotik_id: r[".id"] || null,
          }));
          await supabase.from("pppoe_sessions").insert(pppoeInserts);
        }

        // Insert DHCP leases
        if (dhcpLeases.length > 0) {
          const dhcpInserts = dhcpLeases.map(r => ({
            device_id: device.id,
            address: r.address || "unknown",
            mac_address: r["mac-address"] || null,
            host_name: r["host-name"] || null,
            server: r.server || null,
            status: r.status || null,
            expires_after: r["expires-after"] || null,
            last_seen: r["last-seen"] || null,
            mikrotik_id: r[".id"] || null,
          }));
          await supabase.from("dhcp_leases").insert(dhcpInserts);
        }

        // Insert ARP entries
        if (arpEntries.length > 0) {
          const arpInserts = arpEntries.map(r => ({
            device_id: device.id,
            address: r.address || "unknown",
            mac_address: r["mac-address"] || null,
            interface: r.interface || null,
            is_dynamic: r.dynamic === "true",
            is_complete: r.complete === "true",
            mikrotik_id: r[".id"] || null,
          }));
          await supabase.from("arp_entries").insert(arpInserts);
        }

        results.push({
          device: device.name,
          success: true,
          pppoe_sessions: pppoeActive.length,
          dhcp_leases: dhcpLeases.length,
          arp_entries: arpEntries.length,
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
    console.error("Error in fetch-pppoe-dhcp:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
