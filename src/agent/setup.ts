import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  GetRoleCommand,
  IAMClient,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

const AGENT_SPACE_ROLE_NAME = "DevOpsAgentRole-AgentSpace";
const OPERATOR_APP_ROLE_NAME = "DevOpsAgentRole-WebappAdmin";
const SERVICE_LINKED_ROLE_POLICY_NAME = "AllowCreateServiceLinkedRoles";

function buildSourceArn(accountId: string, region: string): string {
  return `arn:aws:aidevops:${region}:${accountId}:agentspace/*`;
}

function isEntityAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && error.name === "EntityAlreadyExistsException";
}

async function getExistingRoleArn(iam: IAMClient, roleName: string): Promise<string> {
  const role = await iam.send(new GetRoleCommand({ RoleName: roleName }));
  if (!role.Role?.Arn) {
    throw new Error(`IAM role ${roleName} exists but did not return an ARN`);
  }
  return role.Role.Arn;
}

export async function createAgentSpaceRole(accountId: string, region: string): Promise<string> {
  const iam = new IAMClient({ region });

  try {
    await iam.send(new CreateRoleCommand({
      RoleName: AGENT_SPACE_ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "aidevops.amazonaws.com",
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "aws:SourceAccount": accountId,
              },
              ArnLike: {
                "aws:SourceArn": buildSourceArn(accountId, region),
              },
            },
          },
        ],
      }),
    }));
  } catch (error) {
    if (!isEntityAlreadyExistsError(error)) {
      throw error;
    }
  }

  await iam.send(new AttachRolePolicyCommand({
    RoleName: AGENT_SPACE_ROLE_NAME,
    PolicyArn: "arn:aws:iam::aws:policy/AIDevOpsAgentAccessPolicy",
  }));

  await iam.send(new PutRolePolicyCommand({
    RoleName: AGENT_SPACE_ROLE_NAME,
    PolicyName: SERVICE_LINKED_ROLE_POLICY_NAME,
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCreateServiceLinkedRoles",
          Effect: "Allow",
          Action: ["iam:CreateServiceLinkedRole"],
          Resource: [
            `arn:aws:iam::${accountId}:role/aws-service-role/resource-explorer-2.amazonaws.com/AWSServiceRoleForResourceExplorer`,
          ],
        },
      ],
    }),
  }));

  return getExistingRoleArn(iam, AGENT_SPACE_ROLE_NAME);
}

export async function createOperatorAppRole(accountId: string, region: string): Promise<string> {
  const iam = new IAMClient({ region });

  try {
    await iam.send(new CreateRoleCommand({
      RoleName: OPERATOR_APP_ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "aidevops.amazonaws.com",
            },
            Action: ["sts:AssumeRole", "sts:TagSession"],
            Condition: {
              StringEquals: {
                "aws:SourceAccount": accountId,
              },
              ArnLike: {
                "aws:SourceArn": buildSourceArn(accountId, region),
              },
            },
          },
        ],
      }),
    }));
  } catch (error) {
    if (!isEntityAlreadyExistsError(error)) {
      throw error;
    }
  }

  await iam.send(new AttachRolePolicyCommand({
    RoleName: OPERATOR_APP_ROLE_NAME,
    PolicyArn: "arn:aws:iam::aws:policy/AIDevOpsOperatorAppAccessPolicy",
  }));

  return getExistingRoleArn(iam, OPERATOR_APP_ROLE_NAME);
}

export async function getAccountId(region?: string): Promise<string> {
  const sts = new STSClient(region ? { region } : {});
  const response = await sts.send(new GetCallerIdentityCommand({}));
  if (!response.Account) {
    throw new Error("Unable to determine AWS account ID from STS");
  }
  return response.Account;
}
