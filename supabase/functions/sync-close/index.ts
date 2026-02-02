import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const body = await req.json();
    const { action, eventId, leadEmail, notes, pipelineStatus, dealClosed, cashCollected, organizationId } = body;

    // STRICT ORG ISOLATION: Require organizationId for all operations
    if (!organizationId) {
      console.error('organizationId is required');
      return new Response(
        JSON.stringify({ error: 'organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get org name for logging
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle();

    // STRICT: Get Close API key using encrypted key helper (enables lazy migration)
    const CLOSE_API_KEY = await getApiKey(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, organizationId, 'close', 'sync-close');
    
    if (!CLOSE_API_KEY) {
      console.error(`No Close API key configured for org ${orgData?.name}`);
      return new Response(
        JSON.stringify({ error: `Close API key not configured for ${orgData?.name || 'this organization'}. Please add your API key in Settings → Integrations.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Using encrypted Close API key for ${orgData?.name}`);

    const authHeader = btoa(`${CLOSE_API_KEY}:`);

    // Handle "test" action - just verify the API key works
    if (action === 'test') {
      const testResponse = await fetch('https://api.close.com/api/v1/me/', {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      });

      if (!testResponse.ok) {
        throw new Error('Failed to authenticate with Close CRM');
      }

      const userData = await testResponse.json();
      console.log('Close API test successful:', userData.first_name, userData.last_name);

      return new Response(
        JSON.stringify({ success: true, user: `${userData.first_name} ${userData.last_name}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle "sync" action - sync all events with Close data
    if (action === 'sync') {
      console.log('Starting bulk sync from Close CRM...');
      
      // Get all events that might need syncing
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, lead_email, lead_name, setter_name, source_id, traffic_type_id')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (eventsError) {
        console.error('Failed to fetch events:', eventsError);
        throw new Error('Failed to fetch events');
      }

      let updated = 0;
      let skipped = 0;
      let errors = 0;
      const updatedRecords: Array<{ email: string; name: string; changes: string[] }> = [];

      // Cache for Close user ID to name lookups
      const userNameCache: Record<string, string> = {};

      // Helper to resolve Close user ID to name
      const resolveUserName = async (userId: string): Promise<string | null> => {
        if (!userId) return null;
        
        // Check if it's already a name (not a user ID)
        if (!userId.startsWith('user_')) {
          return userId;
        }

        // Check cache
        if (userNameCache[userId]) {
          return userNameCache[userId];
        }

        try {
          const userResponse = await fetch(`https://api.close.com/api/v1/user/${userId}/`, {
            headers: {
              'Authorization': `Basic ${authHeader}`,
              'Content-Type': 'application/json',
            },
          });

          if (userResponse.ok) {
            const userData = await userResponse.json();
            const fullName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim();
            if (fullName) {
              userNameCache[userId] = fullName;
              return fullName;
            }
          }
        } catch (e) {
          console.error('Failed to resolve user:', userId, e);
        }

        return null;
      };

      // Get custom fields once
      const customFieldsResponse = await fetch('https://api.close.com/api/v1/custom_field/lead/', {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      });

      let platformFieldId: string | null = null;
      let setterFieldId: string | null = null;
      let trafficTypeFieldId: string | null = null;

      if (customFieldsResponse.ok) {
        const customFieldsData = await customFieldsResponse.json();
        console.log('Available custom fields:', customFieldsData.data?.map((f: { name: string, id: string }) => f.name));
        
        // Find Platform field
        const platformField = customFieldsData.data?.find((f: { name: string }) => 
          f.name.toLowerCase() === 'platform' || f.name.toLowerCase().includes('platform')
        );
        if (platformField) platformFieldId = platformField.id;

        // Find Setter field (Lead Owner | Setter)
        const setterField = customFieldsData.data?.find((f: { name: string }) => 
          f.name === 'Lead Owner | Setter' ||
          f.name.toLowerCase().includes('setter')
        );
        if (setterField) setterFieldId = setterField.id;

        // Find Traffic Type field
        const trafficTypeField = customFieldsData.data?.find((f: { name: string }) => 
          f.name.toLowerCase().includes('traffic type')
        );
        if (trafficTypeField) trafficTypeFieldId = trafficTypeField.id;

        console.log('Field IDs - Platform:', platformFieldId, 'Setter:', setterFieldId, 'TrafficType:', trafficTypeFieldId);
      }

      for (const event of events || []) {
        if (!event.lead_email) {
          skipped++;
          continue;
        }

        try {
          // Search for lead in Close
          const searchResponse = await fetch(
            `https://api.close.com/api/v1/lead/?query=email:${encodeURIComponent(event.lead_email)}`,
            {
              headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!searchResponse.ok) {
            console.error('Close search failed for:', event.lead_email);
            errors++;
            continue;
          }

          const searchData = await searchResponse.json();
          
          if (!searchData.data || searchData.data.length === 0) {
            console.log('Lead not found in Close:', event.lead_email);
            skipped++;
            continue;
          }

          const lead = searchData.data[0];
          const updateData: Record<string, unknown> = {};
          const changes: string[] = [];

          // Extract Platform (source) - only from allowed platforms
          // Skip N/A, empty, or non-allowed values
          const ALLOWED_PLATFORMS = ['LinkedIn', 'X', 'YouTube', 'Newsletter', 'Instagram', 'Facebook'];
          
          if (platformFieldId) {
            const platformValue = lead[`custom.${platformFieldId}`];
            
            // Check if it's a valid platform (not N/A, empty, or non-allowed)
            const isValidPlatform = platformValue && 
              platformValue.toLowerCase() !== 'n/a' && 
              platformValue.trim() !== '' &&
              ALLOWED_PLATFORMS.some(p => p.toLowerCase() === platformValue.toLowerCase());
            
            if (isValidPlatform) {
              // Find or create source
              const { data: sources } = await supabase.from('sources').select('id, name').eq('organization_id', organizationId);
              let sourceId = sources?.find(s => s.name.toLowerCase() === platformValue.toLowerCase())?.id;
              
              if (!sourceId) {
                const { data: newSource } = await supabase
                  .from('sources')
                  .insert({ name: platformValue, organization_id: organizationId })
                  .select('id')
                  .single();
                sourceId = newSource?.id;
              }
              
              if (sourceId && sourceId !== event.source_id) {
                updateData.source_id = sourceId;
                changes.push(`Source: ${platformValue}`);
              }
            } else if (event.source_id) {
              // Clear source if Close has N/A or invalid value
              updateData.source_id = null;
              changes.push('Source: cleared');
            }
          }

          // Extract Setter - resolve user ID to actual name
          // Only set if there's an actual setter value from Close (not from closer field)
          // Also skip "Ben Kelly" as it's a filler/placeholder name
          if (setterFieldId) {
            const setterValue = lead[`custom.${setterFieldId}`];
            if (setterValue) {
              // Resolve user ID to name if needed
              const resolvedName = await resolveUserName(setterValue);
              if (resolvedName && resolvedName !== 'Ben Kelly' && resolvedName !== event.setter_name) {
                updateData.setter_name = resolvedName;
                changes.push(`Setter: ${resolvedName}`);
              } else if (resolvedName === 'Ben Kelly' && event.setter_name) {
                // Clear setter if it's the filler name
                updateData.setter_name = null;
                changes.push('Setter: cleared');
              }
            } else if (event.setter_name) {
              // No setter value in Close - clear it
              updateData.setter_name = null;
              changes.push('Setter: cleared');
            }
          }
          
          // Also check if existing setter_name needs to be cleared
          if (event.setter_name === 'Ben Kelly' || (event.setter_name && event.setter_name.startsWith('user_'))) {
            // Try to resolve user IDs, otherwise clear
            if (event.setter_name.startsWith('user_')) {
              const resolvedName = await resolveUserName(event.setter_name);
              if (resolvedName && !resolvedName.startsWith('user_') && resolvedName !== 'Ben Kelly') {
                updateData.setter_name = resolvedName;
                changes.push(`Setter: ${resolvedName}`);
              } else if (!updateData.setter_name) {
                updateData.setter_name = null;
                changes.push('Setter: cleared');
              }
            } else if (!updateData.setter_name) {
              updateData.setter_name = null;
              changes.push('Setter: cleared');
            }
          }

          // Extract Traffic Type
          if (trafficTypeFieldId) {
            const trafficTypeValue = lead[`custom.${trafficTypeFieldId}`];
            if (trafficTypeValue && !event.traffic_type_id) {
              // Find or create traffic type
              const { data: types } = await supabase.from('traffic_types').select('id, name').eq('organization_id', organizationId);
              let typeId = types?.find(t => t.name.toLowerCase() === trafficTypeValue.toLowerCase())?.id;
              
              if (!typeId) {
                const { data: newType } = await supabase
                  .from('traffic_types')
                  .insert({ name: trafficTypeValue, organization_id: organizationId })
                  .select('id')
                  .single();
                typeId = newType?.id;
              }
              
              if (typeId) {
                updateData.traffic_type_id = typeId;
                changes.push(`Traffic Type: ${trafficTypeValue}`);
              }
            }
          }

          // Update event if we have data
          if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await supabase
              .from('events')
              .update(updateData)
              .eq('id', event.id);

            if (updateError) {
              console.error('Failed to update event:', event.id, updateError);
              errors++;
            } else {
              console.log('Updated event', event.id, 'with:', updateData);
              updated++;
              updatedRecords.push({
                email: event.lead_email,
                name: event.lead_name || event.lead_email,
                changes,
              });
            }
          } else {
            skipped++;
          }
        } catch (e) {
          console.error('Error processing event:', event.id, e);
          errors++;
        }
      }

      console.log(`Bulk sync complete: ${updated} updated, ${skipped} skipped, ${errors} errors`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          updated, 
          skipped, 
          errors, 
          total: events?.length || 0,
          updatedRecords: updatedRecords.slice(0, 20), // Limit to 20 for display
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle individual event sync (existing behavior)
    if (!leadEmail) {
      return new Response(
        JSON.stringify({ error: 'leadEmail is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Syncing individual event to Close:', { eventId, leadEmail, pipelineStatus, dealClosed });

    // 1. Search for lead in Close by email
    const searchResponse = await fetch(
      `https://api.close.com/api/v1/lead/?query=email:${encodeURIComponent(leadEmail)}`,
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Close API search error:', searchResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to search Close leads', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchResponse.json();
    console.log('Close search results:', searchData.total_results);

    if (searchData.data && searchData.data.length > 0) {
      const lead = searchData.data[0];
      const leadId = lead.id;
      console.log('Found Close lead:', leadId);

      // 2. Add a note to the lead
      if (notes) {
        const noteResponse = await fetch('https://api.close.com/api/v1/activity/note/', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lead_id: leadId,
            note: `[SalesReps PCF] ${notes}`,
          }),
        });

        if (!noteResponse.ok) {
          console.error('Failed to add note to Close:', await noteResponse.text());
        } else {
          console.log('Note added to Close lead');
        }
      }

      // 3. Update lead status if pipeline status is provided
      if (pipelineStatus) {
        const statusesResponse = await fetch('https://api.close.com/api/v1/status/lead/', {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
        });

        if (statusesResponse.ok) {
          const statusesData = await statusesResponse.json();
          const matchingStatus = statusesData.data?.find((s: { label: string }) => 
            s.label.toLowerCase().includes(pipelineStatus.toLowerCase())
          );

          if (matchingStatus) {
            const updateResponse = await fetch(`https://api.close.com/api/v1/lead/${leadId}/`, {
              method: 'PUT',
              headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status_id: matchingStatus.id,
              }),
            });

            if (!updateResponse.ok) {
              console.error('Failed to update lead status:', await updateResponse.text());
            } else {
              console.log('Lead status updated in Close');
            }
          }
        }
      }

      // 4. If deal closed, create opportunity/won deal
      if (dealClosed && cashCollected) {
        const pipelinesResponse = await fetch('https://api.close.com/api/v1/pipeline/', {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
        });

        if (pipelinesResponse.ok) {
          const pipelinesData = await pipelinesResponse.json();
          const pipeline = pipelinesData.data?.[0];
          
          if (pipeline) {
            const wonStatus = pipeline.statuses?.find((s: { type: string }) => s.type === 'won');
            
            if (wonStatus) {
              const opportunityResponse = await fetch('https://api.close.com/api/v1/opportunity/', {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${authHeader}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  lead_id: leadId,
                  status_id: wonStatus.id,
                  value: cashCollected * 100,
                  value_period: 'one_time',
                  note: 'Closed via SalesReps PCF',
                }),
              });

              if (!opportunityResponse.ok) {
                console.error('Failed to create opportunity:', await opportunityResponse.text());
              } else {
                console.log('Opportunity created in Close');
              }
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, leadId, message: 'Synced to Close successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log('Lead not found in Close for email:', leadEmail);
      return new Response(
        JSON.stringify({ success: false, message: 'Lead not found in Close' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in sync-close function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});