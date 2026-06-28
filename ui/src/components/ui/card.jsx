export function Card(props) {
  return (
    <div class={`rounded-xl border border-line bg-paper text-ink shadow-soft ${props.class || ""}`} style={props.style}>
      {props.children}
    </div>
  )
}

export function CardHeader(props) {
  return (
    <div class={`flex flex-col space-y-1.5 p-4 ${props.class || ""}`}>
      {props.children}
    </div>
  )
}

export function CardTitle(props) {
  return (
    <h3 class={`text-sm font-semibold leading-none tracking-tight ${props.class || ""}`}>
      {props.children}
    </h3>
  )
}

export function CardDescription(props) {
  return (
    <p class={`text-xs text-muted ${props.class || ""}`}>
      {props.children}
    </p>
  )
}

export function CardContent(props) {
  return (
    <div class={`p-4 pt-0 ${props.class || ""}`}>
      {props.children}
    </div>
  )
}

export function CardFooter(props) {
  return (
    <div class={`flex items-center p-4 pt-0 ${props.class || ""}`}>
      {props.children}
    </div>
  )
}
