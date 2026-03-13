import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { Paper } from "./types.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

function tableName(): string {
  return Resource.Papers.name;
}

export async function putPaper(paper: Paper): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: paper,
    })
  );
}

export async function getPaper(arxivId: string): Promise<Paper | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { arxiv_id: arxivId },
    })
  );
  return (result.Item as Paper) ?? null;
}

export async function paperExists(arxivId: string): Promise<boolean> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { arxiv_id: arxivId },
      ProjectionExpression: "arxiv_id",
    })
  );
  return !!result.Item;
}

export async function queryByTier(
  tier: string,
  options: {
    limit?: number;
    scanForward?: boolean;
    nextToken?: Record<string, any>;
  } = {}
): Promise<{ papers: Paper[]; nextToken?: Record<string, any> }> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: "tierTrending",
      KeyConditionExpression: "tier = :tier",
      ExpressionAttributeValues: { ":tier": tier },
      Limit: options.limit ?? 20,
      ScanIndexForward: options.scanForward ?? false,
      ExclusiveStartKey: options.nextToken,
    })
  );
  return {
    papers: (result.Items as Paper[]) ?? [],
    nextToken: result.LastEvaluatedKey,
  };
}

export async function scanAllPapers(
  tiers: string[] = ["hot", "warm"]
): Promise<Paper[]> {
  const papers: Paper[] = [];
  for (const tier of tiers) {
    let nextToken: Record<string, any> | undefined;
    do {
      const result = await queryByTier(tier, { limit: 100, nextToken });
      papers.push(...result.papers);
      nextToken = result.nextToken;
    } while (nextToken);
  }
  return papers;
}

export async function deletePaper(arxivId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { arxiv_id: arxivId },
    })
  );
}

export async function batchPutPapers(papers: Paper[]): Promise<void> {
  const chunks: Paper[][] = [];
  for (let i = 0; i < papers.length; i += 25) {
    chunks.push(papers.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName()]: chunk.map((paper) => ({
            PutRequest: { Item: paper },
          })),
        },
      })
    );
  }
}
