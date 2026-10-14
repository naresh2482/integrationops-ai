export function redactSensitiveData(input: string): string {
  return input
    .replace(
      /(Authorization:[ \t]*Bearer[ \t]+)[^\s]+/gi,
      "$1[REDACTED]"
    )
    .replace(
      /(X-API-Key:[ \t]*)[^\s]+/gi,
      "$1[REDACTED]"
    )
    .replace(
      /(\bpassword[ \t]*=[ \t]*)[^\s&]+/gi,
      "$1[REDACTED]"
    )
    .replace(
      /([?&]api_key[ \t]*=[ \t]*)[^&#\s]+/gi,
      "$1[REDACTED]"
    );
}