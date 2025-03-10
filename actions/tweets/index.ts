'use server';

import { prisma } from '@/lib/prisma';
import { Tweet } from '@/types/admin/tweets';
import { TwitterResponse } from '@/types/admin/tweets';

const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const TWITTER_USER_ID = process.env.TWITTER_USER_ID;
const TWITTER_API_BASE = 'https://api.x.com/2';

async function saveTweetToDB(tweet: Tweet) {
  const existingTweet = await prisma.tweet.findUnique({
    where: { id: tweet.id },
  });

  if (!existingTweet) {
    await prisma.tweet.create({
      data: {
        id: tweet.id,
        text: tweet.text,
        createdAt: new Date(tweet.created_at),
        retweetCount: tweet.public_metrics.retweet_count,
        replyCount: tweet.public_metrics.reply_count,
        likeCount: tweet.public_metrics.like_count,
        quoteCount: tweet.public_metrics.quote_count,
        conversationId: tweet.conversation_id,
        inReplyToUserId: tweet.in_reply_to_user_id,
      },
    });
  }
}

export async function fetchAllDSCTweets(limit: number = 20): Promise<Tweet[]> {
  if (!TWITTER_BEARER_TOKEN || !TWITTER_USER_ID) {
    throw new Error('Twitter configuration is incomplete');
  }

  try {
    const tweetsResponse = await fetch(
      `${TWITTER_API_BASE}/users/${TWITTER_USER_ID}/tweets?` +
        new URLSearchParams({
          max_results: limit.toString(),
          'tweet.fields':
            'created_at,public_metrics,conversation_id,in_reply_to_user_id',
          exclude: 'retweets',
        }),
      {
        headers: {
          Authorization: `Bearer ${TWITTER_BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Tweets response:', tweetsResponse);

    if (!tweetsResponse.ok) {
      throw new Error('Failed to fetch tweets-1');
    }

    const tweetsData: TwitterResponse = await tweetsResponse.json();

    if (!tweetsData.data) {
      return [];
    }

    console.log('All tweets:', tweetsData.data);

    const tweets = tweetsData.data.map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.created_at,
      retweetCount: tweet.public_metrics.retweet_count,
      replyCount: tweet.public_metrics.reply_count,
      likeCount: tweet.public_metrics.like_count,
      quoteCount: tweet.public_metrics.quote_count,
      public_metrics: tweet.public_metrics,
      conversation_id: tweet.conversation_id,
      in_reply_to_user_id: tweet.in_reply_to_user_id,
    }));

    console.log('Tweets:', tweets);

    for (const tweet of tweets) {
      await saveTweetToDB(tweet);
    }

    return tweets;
  } catch (error) {
    console.error('Error fetching tweets:', error);
    throw new Error('Failed to fetch tweets-2');
  }
}

export async function fetchLatestTweet(): Promise<Tweet | null> {
  if (!TWITTER_BEARER_TOKEN || !TWITTER_USER_ID) {
    throw new Error('Twitter configuration is incomplete');
  }

  try {
    const tweetsResponse = await fetch(
      `${TWITTER_API_BASE}/users/${TWITTER_USER_ID}/tweets?` +
        new URLSearchParams({
          max_results: '1',
          'tweet.fields':
            'created_at,public_metrics,conversation_id,in_reply_to_user_id',
          exclude: 'retweets',
        }),
      {
        headers: {
          Authorization: `Bearer ${TWITTER_BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!tweetsResponse.ok) {
      throw new Error('Failed to fetch the latest tweet');
    }

    const tweetsData: TwitterResponse = await tweetsResponse.json();

    if (!tweetsData.data || tweetsData.data.length === 0) {
      return null;
    }

    const tweet = tweetsData.data[0];

    const tweetData = {
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.created_at,
      public_metrics: tweet.public_metrics,
      conversation_id: tweet.conversation_id,
      in_reply_to_user_id: tweet.in_reply_to_user_id,
    };

    await saveTweetToDB(tweetData);

    return tweetData;
  } catch (error) {
    console.error('Error fetching the latest tweet:', error);
    throw new Error('Failed to fetch the latest tweet');
  }
}

export async function getTotalTweetCount(): Promise<number> {
  try {
    const count = await prisma.tweet.count();
    return count;
  } catch (error) {
    console.error('Error getting total tweet count:', error);
    throw new Error('Failed to get total tweet count');
  }
}

export async function getTweetsFromDB(): Promise<Tweet[]> {
  try {
    const tweets = await prisma.tweet.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const formattedTweets: Tweet[] = tweets.map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.createdAt.toISOString(),
      public_metrics: {
        retweet_count: tweet.retweetCount,
        reply_count: tweet.replyCount,
        like_count: tweet.likeCount,
        quote_count: tweet.quoteCount,
      },
      conversation_id: tweet.conversationId || undefined,
      in_reply_to_user_id: tweet.inReplyToUserId || undefined,
    }));

    return formattedTweets;
  } catch (error) {
    console.error('Error fetching tweets from DB:', error);
    throw new Error('Failed to fetch tweets from DB');
  }
}

export async function updateFetchedAt(
  type: string,
  date?: Date
): Promise<Date> {
  try {
    const defaultDate = new Date('2025-02-27T21:30:00Z');

    // If date is provided, use it to update the record
    if (date) {
      console.log('Updating fetchedAt at:-action', type, date.toISOString());
      const result = await prisma.tweetFetchLog.upsert({
        where: { type },
        update: { fetchedAt: date },
        create: { type, fetchedAt: date },
      });
      console.log('Result-1:-action', result.fetchedAt.toISOString());
      return result.fetchedAt;
    }
    // If no date is provided, retrieve the existing record or create a new one with defaultDate
    else {
      const existingLog = await prisma.tweetFetchLog.findUnique({
        where: { type },
      });

      if (existingLog && existingLog.fetchedAt) {
        console.log(
          'Existing fetchedAt:-action',
          existingLog.fetchedAt.toISOString()
        );
        return existingLog.fetchedAt;
      } else {
        const result = await prisma.tweetFetchLog.create({
          data: { type, fetchedAt: defaultDate },
        });
        console.log('Result-2:-action', result.fetchedAt.toISOString());
        return result.fetchedAt;
      }
    }
  } catch (error) {
    console.error('Error updating fetchedAt:', error);
    throw new Error('Failed to update fetchedAt');
  }
}
