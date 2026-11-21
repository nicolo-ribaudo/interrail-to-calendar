import { Button } from "./Button.tsx";

export function LinkForm({ value = "" }: { value?: string }) {
  return (
    <form method="get" action="/trip" class="link-form">
      <label for="url">Rail Planner share link</label>
      <div class="link-form-row">
        <input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          required
          placeholder="https://eurailapp.com/share/trip?id=…"
          value={value}
          autoComplete="off"
        />
        <Button type="submit">Load trip</Button>
      </div>
    </form>
  );
}
