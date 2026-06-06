import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { IconPlus, IconTrash, IconTag, IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";

type CustomTag = {
  id: string;
  name: string;
  color: string;
  is_work_tag: boolean;
};

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#22c55e", "#14b8a6", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#64748b", "#0ea5e9",
];

export function SettingsTagsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [tags, setTags]       = useState<CustomTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // New tag form
  const [newName, setNewName]       = useState("");
  const [newColor, setNewColor]     = useState(PRESET_COLORS[6]!);
  const [newIsWork, setNewIsWork]   = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("trip_custom_tags")
      .select("id, name, color, is_work_tag")
      .eq("user_id", user.id)
      .order("name");
    if (!error && data) setTags(data as CustomTag[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadTags(); }, [loadTags]);

  async function handleCreate() {
    if (!user || !newName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("trip_custom_tags")
      .insert({ user_id: user.id, name: newName.trim(), color: newColor, is_work_tag: newIsWork });
    setSaving(false);
    if (error) {
      toast.error(t("settings.tagSaveError"));
      return;
    }
    toast.success(t("settings.tagCreated"));
    setNewName("");
    setNewColor(PRESET_COLORS[6]!);
    setNewIsWork(false);
    setShowForm(false);
    loadTags();
  }

  async function handleDelete(id: string) {
    if (!user) return;
    const { error } = await supabase
      .from("trip_custom_tags")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(t("settings.tagDeleteError"));
      return;
    }
    toast.success(t("settings.tagDeleted"));
    setConfirmDelete(null);
    setTags(prev => prev.filter(t => t.id !== id));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconTag className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>{t("settings.tagsTitle")}</CardTitle>
              <CardDescription className="mt-0.5">{t("settings.tagsPageDescription")}</CardDescription>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(s => !s)} className="gap-1.5">
            <IconPlus className="h-4 w-4" />
            {t("settings.tagNew")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create form */}
        {showForm && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium">{t("settings.tagNew")}</p>
            <div className="flex items-center gap-2">
              <Input
                placeholder={t("settings.tagNamePlaceholder")}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1 h-8 text-sm"
                maxLength={30}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("settings.tagColor")}</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110"
                    style={{ background: c, borderColor: newColor === c ? "#000" : "transparent" }}
                    onClick={() => setNewColor(c)}
                  >
                    {newColor === c && <IconCheck className="h-3.5 w-3.5 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="new-work-tag" checked={newIsWork} onCheckedChange={v => setNewIsWork(!!v)} />
              <Label htmlFor="new-work-tag" className="text-sm">{t("settings.tagIsWork")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim()} className="gap-1.5">
                <IconCheck className="h-4 w-4" />
                {t("settings.tagSave")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>{t("settings.cancel")}</Button>
            </div>
          </div>
        )}

        {/* Tag list */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : tags.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("settings.tagsEmpty")}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            {tags.map((tag, i) => (
              <div key={tag.id}
                className={`flex items-center gap-3 px-4 py-3 ${i < tags.length - 1 ? "border-b" : ""}`}
              >
                <span className="w-4 h-4 rounded-full shrink-0" style={{ background: tag.color }} />
                <span className="flex-1 text-sm font-medium">{tag.name}</span>
                {tag.is_work_tag && (
                  <Badge variant="secondary" className="text-xs h-5">{t("settings.tagWorkBadge")}</Badge>
                )}
                {confirmDelete === tag.id ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="destructive" className="h-7 text-xs"
                      onClick={() => handleDelete(tag.id)}>
                      {t("settings.confirmDelete")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => setConfirmDelete(null)}>
                      {t("settings.cancel")}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDelete(tag.id)}>
                    <IconTrash className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
