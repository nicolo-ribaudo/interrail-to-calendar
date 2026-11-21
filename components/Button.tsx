import type { ComponentChildren } from "preact";

export function Button(props: {
  children: ComponentChildren;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      class={`btn btn-${props.variant ?? "primary"}`}
    >
      {props.children}
    </button>
  );
}
