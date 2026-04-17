import { SharedResourcePayload, ShareResourceType } from '../types';
import { supabase } from './supabase';

export const createShareLink = async (resourceType: ShareResourceType, resourceId: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase.functions.invoke<{ token: string }>('create-share-link', {
    body: {
      resourceType,
      resourceId
    }
  });

  if (error) {
    throw error;
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
    throw error;
  }

  if (!data) {
    throw new Error('Shared resource not found.');
  }

  return data;
};
