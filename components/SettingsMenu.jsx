import { useState } from "react";
import {
  Settings, UserCircle2, Info, GraduationCap, Sun, Moon, LogIn, LogOut, Cloud, CloudOff,
  Upload, Download, MessageSquare, ShieldCheck, Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

function Item({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-left transition-colors hover:bg-muted ${danger ? "text-destructive" : "text-foreground"}`}>
      <Icon className={`h-4 w-4 shrink-0 ${danger ? "" : "text-muted-foreground"}`} />
      <span>{label}</span>
    </button>
  );
}

/**
 * The header ⚙ Settings menu. Renders its own trigger (a gear button) and a
 * popover of actions. Each action closes the menu, then calls up to the parent.
 */
function accessText(a) {
  if (!a) return null;
  if (a.isAdmin) return "Admin · unlimited access";
  if (a.expired) return "Beta trial ended";
  if (a.inTrial) return `Beta trial · ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left`;
  return `Access · ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left`;
}

export function SettingsMenu({ user, dark, setDark, onImport, onExport, onOpenAccount, onOpenAbout, onOpenTutorial, onOpenFeedback, onOpenReport, onOpenAdmin, onSignIn, onSignOut }) {
  const [open, setOpen] = useState(false);
  const run = (fn) => () => { setOpen(false); fn?.(); };
  const isAdmin = !!user?.access?.isAdmin;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="px-2" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-60 p-1.5">
        {/* Signed-in identity / sync status */}
        <div className="px-2.5 py-2">
          {user ? (
            <>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <Cloud className="h-3.5 w-3.5" />Synced to your account
              </div>
              <div className="font-data text-[12px] text-muted-foreground truncate mt-0.5">{user.email}</div>
              <div className={`text-[11px] mt-0.5 ${user.access?.expired ? "text-destructive" : user.access?.inTrial ? "text-amber-600" : "text-muted-foreground"}`}>
                {accessText(user.access)}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <CloudOff className="h-3.5 w-3.5" />Guest — saved on this device
            </div>
          )}
        </div>
        <Separator className="my-1" />

        {/* JSON file — load / save the current study as a .json file */}
        <div className="px-2.5 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Study file (JSON)</div>
        <Item icon={Upload} label="Load study from file" onClick={run(onImport)} />
        <Item icon={Download} label="Save study to file" onClick={run(onExport)} />
        <Separator className="my-1" />

        {user && <Item icon={MessageSquare} label="Send feedback" onClick={run(onOpenFeedback)} />}
        {user && <Item icon={Bug} label="Report a bug / idea" onClick={run(onOpenReport)} />}
        {isAdmin && <Item icon={ShieldCheck} label="Admin panel" onClick={run(onOpenAdmin)} />}
        {(user || isAdmin) && <Separator className="my-1" />}

        {user
          ? <Item icon={UserCircle2} label="Account" onClick={run(onOpenAccount)} />
          : <Item icon={LogIn} label="Sign in / Create account" onClick={run(onSignIn)} />}
        <Item icon={Info} label="About this app" onClick={run(onOpenAbout)} />
        <Item icon={GraduationCap} label="Tutorial" onClick={run(onOpenTutorial)} />
        <Item icon={dark ? Sun : Moon} label={dark ? "Light appearance" : "Dark appearance"} onClick={run(() => setDark(!dark))} />

        {user && (
          <>
            <Separator className="my-1" />
            <Item icon={LogOut} label="Sign out" onClick={run(onSignOut)} danger />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
