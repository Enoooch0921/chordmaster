import { SharedResourcePayload, ShareResourceType } from '../types';
import { supabase } from './supabase';

const SHARE_AUTH_REQUIRED_MESSAGE = 'Please sign in again to create a share link.';
const SHARE_CREATE_FAILED_MESSAGE = 'Unable to create share link.';
const SHARE_RESOLVE_FAILED_MESSAGE = 'Unable to load shared chart.';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const extractResponseErrorMessage = async (response: Response) => {
  try {
    const payload = await response.clone().json();
    if (isRecord(payload)) {
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error.trim();
      }

      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message.trim();
      }
    }
  } catch {
    // Fall through to plain text extraction.
  }

  try {
    const text = await response.clone().text();
    const trimmedText = text.trim();
    if (trimmedText) {
      return trimmedText;
    }
  } catch {
    // Ignore response body parse failures and use generic fallbacks below.
  }

  return null;
};

const normalizeFunctionError = async (error: unknown, fallbackMessage: string) => {
  const response = isRecord(error) && error.context instanceof Response
    ? error.context
    : null;

  if (response?.status === 401) {
    return new Error(SHARE_AUTH_REQUIRED_MESSAGE);
  }

  if (response) {
    const responseMessage = await extractResponseErrorMessage(response);
    if (responseMessage) {
      return new Error(responseMessage);
    }
  }

  if (error instanceof Error) {
    if (/unauthorized|jwt|auth/i.test(error.message)) {
      return new Error(SHARE_AUTH_REQUIRED_MESSAGE);
    }

    if (error.message.trim()) {
      return new Error(error.message);
    }
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return new Error(error.message);
  }

  return new Error(fallbackMessage);
};

export const createShareLink = async (resourceType: ShareResourceType, resourceId: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error(SHARE_AUTH_REQUIRED_MESSAGE);
  }

  const { data, error } = await supabase.functions.invoke<{ token: string }>('create-share-link', {
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`
    },
    body: {
      resourceType,
      resourceId
    }
  });

  if (error) {
    throw await normalizeFunctionError(error, SHARE_CREATE_FAILED_MESSAGE);
  }

  if (!data?.token) {
    throw new Error('Missing share token.');
  }

  return data.token;
};

export const resolveShareLink = async (token: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase.functions.invoke<SharedResourcePayload>('resolve-share-link', {
    body: {
      token
    }
  });

  if (error) {
    throw await normalizeFunctionError(error, SHARE_RESOLVE_FAILED_MESSAGE);
  }

  if (!data) {
    throw new Error('Shared resource not found.');
  }

  return data;
};
