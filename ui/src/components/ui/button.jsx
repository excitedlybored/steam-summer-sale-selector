import { splitProps } from 'solid-js'

export function Button(props) {
  const [local, rest] = splitProps(props, ['variant', 'size', 'class', 'children', 'onClick', 'disabled', 'type', 'style'])

  const baseClass = "inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]"
  
  const variants = {
    default: "bg-primary text-white hover:bg-opacity-90 shadow-sm",
    destructive: "bg-accent text-white hover:bg-opacity-90 shadow-sm",
    outline: "border border-line bg-paper text-ink hover:bg-light-dark(rgba(15,23,42,0.04),rgba(255,255,255,0.04))",
    secondary: "bg-light-dark(rgba(15,23,42,0.05),rgba(255,255,255,0.05)) text-ink hover:bg-opacity-90",
    ghost: "hover:bg-light-dark(rgba(15,23,42,0.04),rgba(255,255,255,0.04)) text-ink",
    link: "text-primary underline-offset-4 hover:underline"
  }

  const sizes = {
    default: "h-9 px-4 py-2 text-sm rounded-lg",
    sm: "h-8 px-3 text-xs rounded-md",
    lg: "h-10 px-8 rounded-lg",
    icon: "h-9 w-9 rounded-lg"
  }

  const variant = local.variant || "default"
  const size = local.size || "default"

  return (
    <button
      type={local.type || "button"}
      class={`${baseClass} ${variants[variant]} ${sizes[size]} ${local.class || ""}`}
      disabled={local.disabled}
      onClick={local.onClick}
      style={local.style}
      {...rest}
    >
      {local.children}
    </button>
  )
}
