"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSettings, saveSettings, getDefaultSettings } from "@/services/settings.service";
import type { RestaurantSettings } from "@/types";
import { PageLoader } from "@/components/ui/page-loader";

export default function SettingsPage() {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => setSettings(s ?? getDefaultSettings()))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!settings) return;
    await saveSettings(settings);
    toast.success("Settings saved");
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch("/api/imgbb", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url) {
      setSettings((s) => s ? { ...s, logoUrl: data.url } : s);
      toast.success("Logo uploaded");
    } else toast.error("Upload failed");
    setUploading(false);
  }

  if (loading || !settings) {
    return <PageLoader message="Loading settings..." />;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card className="mt-6">
        <CardHeader><CardTitle>Restaurant Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Name</Label><Input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></div>
          <div><Label>Tax %</Label><Input type="number" value={settings.taxRate} onChange={(e) => setSettings({ ...settings, taxRate: Number(e.target.value) })} /></div>
          <div><Label>Delivery Charge PKR</Label><Input type="number" value={settings.deliveryCharge} onChange={(e) => setSettings({ ...settings, deliveryCharge: Number(e.target.value) })} /></div>
          <div><Label>Logo (ImgBB)</Label><Input type="file" accept="image/*" onChange={uploadLogo} disabled={uploading} /></div>
          {settings.logoUrl && <img src={settings.logoUrl} alt="Logo" className="h-16 rounded" />}
          <Button onClick={save}>Save Settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}
