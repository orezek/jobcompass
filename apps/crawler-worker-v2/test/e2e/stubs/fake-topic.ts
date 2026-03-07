type PublishMessageInput = {
  data: Buffer;
  attributes?: Record<string, string>;
};

export type PublishedEvent = {
  id: string;
  payload: string;
  attributes: Record<string, string> | undefined;
};

export class FakePubSubTopic {
  public readonly published: PublishedEvent[] = [];

  public async publishMessage(input: PublishMessageInput): Promise<string> {
    const id = `msg-${this.published.length + 1}`;
    this.published.push({
      id,
      payload: input.data.toString('utf8'),
      attributes: input.attributes,
    });
    return id;
  }
}
