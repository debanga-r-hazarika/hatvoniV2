import { supabase } from '../lib/supabase';

export const addressService = {
  async getAddresses(userId) {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async createAddress(userId, addressData) {
    const { data, error } = await supabase
      .from('addresses')
      .insert([
        {
          user_id: userId,
          ...addressData
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateAddress(addressId, addressData) {
    const { data, error } = await supabase
      .from('addresses')
      .update({
        ...addressData,
        updated_at: new Date().toISOString()
      })
      .eq('id', addressId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteAddress(addressId) {
    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', addressId);

    if (error) throw error;
    return true;
  },

  async setDefaultAddress(userId, addressId) {
    await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', userId);

    const { data, error } = await supabase
      .from('addresses')
      .update({ is_default: true })
      .eq('id', addressId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
