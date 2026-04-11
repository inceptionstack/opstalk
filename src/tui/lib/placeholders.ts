const PLACEHOLDER_PROMPTS = [
  "Help me find cost savings in this AWS account",
  "List all S3 buckets sorted by size",
  "Show me any security findings from Security Hub",
  "What EC2 instances are running and how much do they cost?",
  "Are there any idle or underutilized resources?",
  "Show me recent CloudTrail events for IAM changes",
  "What Lambda functions have the highest error rates?",
  "Find RDS instances without backups enabled",
  "List all public-facing resources in this account",
  "Show me CloudWatch alarms that are in ALARM state",
  "What are the top 5 most expensive services this month?",
  "Check if any EBS volumes are unattached",
  "Review my IAM policies for overly permissive access",
  "Show me resources that are not tagged properly",
  "Are there any expiring SSL certificates?",
];

export function getRandomPlaceholder(): string {
  const index = Math.floor(Math.random() * PLACEHOLDER_PROMPTS.length);
  return PLACEHOLDER_PROMPTS[index] ?? PLACEHOLDER_PROMPTS[0]!;
}
